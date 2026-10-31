import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { Lease } from '../models/Lease.js';
import { Invitation } from '../models/Invitation.js';
import { User } from '../models/User.js';
import { Unit } from '../models/Unit.js';
import { AppError } from '../utils/AppError.js';
import { config } from '../config/index.js';
import { emailService } from './emailService.js';

async function inviteTenant(
  landlordId: string,
  leaseId: string,
  data: { email: string; tenantName: string; tenantDni: string },
) {
  const lease = await Lease.findOne({ _id: leaseId, landlordId, status: 'active' });
  if (!lease) throw AppError.notFound('Contrato no encontrado o no está activo', 'LEASE_NOT_FOUND');

  // Expire any previous pending invitations for this lease
  await Invitation.updateMany(
    { leaseId, status: 'pending' },
    { status: 'expired' },
  );

  // Generate token
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

  // Update lease with tenant info
  lease.tenantName = data.tenantName;
  lease.tenantDni = data.tenantDni;
  lease.tenantEmail = data.email;
  await lease.save();

  // Get landlord name and unit address for email
  const landlord = await User.findById(landlordId).lean();
  const unit = await Unit.findById(lease.unitId).lean();
  const landlordName = landlord ? `${landlord.firstName} ${landlord.lastName}` : 'Tu propietario';
  const unitAddr = unit
    ? `${unit.address.street} ${unit.address.number}${unit.address.floor ? `, ${unit.address.floor}°` : ''}`
    : '';

  await emailService.sendInvitation(data.email, data.tenantName, landlordName, unitAddr, token);

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

  // Check if user already exists
  let user = await User.findOne({ email: invitation.email });

  if (user) {
    // Link existing user to lease
    lease.tenantId = user._id as any;
  } else {
    // Create new tenant user
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

    lease.tenantId = user._id as any;
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
