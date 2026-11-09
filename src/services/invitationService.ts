import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { Lease } from '../models/Lease.js';
import { Invitation } from '../models/Invitation.js';
import { User } from '../models/User.js';
import { Unit } from '../models/Unit.js';
import { AppError } from '../utils/AppError.js';
import { config } from '../config/index.js';
import { emailService } from './emailService.js';
import { notificationService } from './notificationService.js';

async function inviteTenant(
  landlordId: string,
  leaseId: string,
  data: { email: string; tenantName: string; tenantDni: string },
) {
  const lease = await Lease.findOne({ _id: leaseId, landlordId, status: 'active' });
  if (!lease) throw AppError.notFound('Contrato no encontrado o no está activo', 'LEASE_NOT_FOUND');

  await Invitation.updateMany(
    { leaseId, status: 'pending' },
    { status: 'expired' },
  );

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  await Invitation.create({
    leaseId,
    email: data.email,
    tenantName: data.tenantName,
    tenantDni: data.tenantDni,
    tokenHash,
    expiresAt: new Date(Date.now() + config.invitationExpiryDays * 24 * 60 * 60 * 1000),
    status: 'pending',
  });

  lease.tenantName = data.tenantName;
  lease.tenantDni = data.tenantDni;
  lease.tenantEmail = data.email;
  await lease.save();

  const landlord = await User.findById(landlordId).lean();
  const unit = await Unit.findById(lease.unitId).lean();
  const landlordName = landlord ? `${landlord.firstName} ${landlord.lastName}` : 'Tu propietario';
  const unitAddr = unit
    ? `${unit.address.street} ${unit.address.number}${unit.address.floor ? `, ${unit.address.floor}°` : ''}`
    : '';

  await emailService.sendInvitation(data.email, data.tenantName, landlordName, unitAddr, token);

  await notificationService.create({
    userId: landlordId,
    type: 'invitation_sent',
    title: 'Invitación enviada',
    message: `Se envió una invitación a ${data.tenantName} (${data.email}).`,
    relatedEntity: { entityType: 'lease', entityId: lease._id },
  });

  return { success: true };
}

async function acceptInvitation(token: string, password: string) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const invitation = await Invitation.findOne({
    tokenHash,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  });

  if (!invitation) {
    throw AppError.badRequest('Invitación inválida o expirada', 'INVITATION_INVALID');
  }

  const lease = await Lease.findById(invitation.leaseId);
  if (!lease || lease.status !== 'active') {
    throw AppError.badRequest('El contrato ya no está activo', 'LEASE_NOT_ACTIVE');
  }

  let user = await User.findOne({ email: invitation.email });

  if (user) {
    lease.tenantId = user._id as mongoose.Types.ObjectId;
  } else {
    const passwordHash = await bcrypt.hash(password, config.bcryptSaltRounds);
    const nameParts = invitation.tenantName.split(' ');
    const firstName = nameParts[0] || invitation.tenantName;
    const lastName = nameParts.slice(1).join(' ') || '';

    user = await User.create({
      firstName,
      lastName,
      dni: invitation.tenantDni,
      email: invitation.email,
      passwordHash,
      role: 'tenant',
    });

    lease.tenantId = user._id as mongoose.Types.ObjectId;
  }

  lease.tenantName = invitation.tenantName;
  lease.tenantDni = invitation.tenantDni;
  lease.tenantEmail = invitation.email;
  await lease.save();

  invitation.status = 'accepted';
  await invitation.save();

  return user;
}

async function resendInvitation(landlordId: string, leaseId: string) {
  const lease = await Lease.findOne({ _id: leaseId, landlordId, status: 'active' });
  if (!lease) throw AppError.notFound('Contrato no encontrado', 'LEASE_NOT_FOUND');

  if (!lease.tenantEmail || !lease.tenantName || !lease.tenantDni) {
    throw AppError.badRequest('No hay datos de inquilino para reenviar', 'NO_TENANT_DATA');
  }

  return inviteTenant(landlordId, leaseId, {
    email: lease.tenantEmail,
    tenantName: lease.tenantName,
    tenantDni: lease.tenantDni,
  });
}

export const invitationService = { inviteTenant, acceptInvitation, resendInvitation };
