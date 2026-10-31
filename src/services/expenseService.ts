import { Expense } from '../models/Expense.js';
import { Unit } from '../models/Unit.js';
import { AppError } from '../utils/AppError.js';
import { toDecimal128, decimalToString } from '../utils/decimal.js';
import { paginate, getSkip, type PaginatedResult } from '../utils/pagination.js';

interface ExpenseDTO {
  id: string;
  unitId: string;
  maintenanceRequestId: string | null;
  date: string;
  category: string;
  concept: string;
  amount: string;
  createdAt: string;
}

function toExpenseDTO(e: any): ExpenseDTO {
  return {
    id: e._id.toString(),
    unitId: e.unitId.toString(),
    maintenanceRequestId: e.maintenanceRequestId?.toString() ?? null,
    date: (e.date instanceof Date ? e.date : new Date(e.date)).toISOString(),
    category: e.category,
    concept: e.concept,
    amount: decimalToString(e.amount),
    createdAt: e.createdAt?.toISOString?.() ?? e.createdAt,
  };
}

async function createExpense(
  landlordId: string,
  unitId: string,
  data: { date: string; category: string; concept: string; amount: string; maintenanceRequestId?: string },
): Promise<ExpenseDTO> {
  const unit = await Unit.findOne({ _id: unitId, landlordId });
  if (!unit) throw AppError.notFound('Unidad no encontrada', 'UNIT_NOT_FOUND');

  const expense = await Expense.create({
    unitId,
    maintenanceRequestId: data.maintenanceRequestId || null,
    date: new Date(data.date),
    category: data.category as any,
    concept: data.concept,
    amount: toDecimal128(data.amount),
  });

  return toExpenseDTO(expense);
}

async function listExpenses(
  landlordId: string,
  unitId: string,
  query: { from?: string; to?: string; category?: string; page?: number; limit?: number },
): Promise<PaginatedResult<ExpenseDTO>> {
  const unit = await Unit.findOne({ _id: unitId, landlordId });
  if (!unit) throw AppError.notFound('Unidad no encontrada', 'UNIT_NOT_FOUND');

  const filter: any = { unitId };
  if (query.from || query.to) {
    const dateFilter: any = {};
    if (query.from) dateFilter.$gte = new Date(query.from);
    if (query.to) dateFilter.$lte = new Date(query.to);
    filter.date = dateFilter;
  }
  if (query.category) filter.category = query.category;

  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const skip = getSkip(page, limit);

  const [expenses, total] = await Promise.all([
    Expense.find(filter).sort({ date: -1 }).skip(skip).limit(limit).lean(),
    Expense.countDocuments(filter),
  ]);

  return paginate(expenses.map(toExpenseDTO), total, page, limit);
}

async function getExpenseById(landlordId: string, unitId: string, expenseId: string): Promise<ExpenseDTO> {
  const unit = await Unit.findOne({ _id: unitId, landlordId });
  if (!unit) throw AppError.notFound('Unidad no encontrada', 'UNIT_NOT_FOUND');

  const expense = await Expense.findOne({ _id: expenseId, unitId }).lean();
  if (!expense) throw AppError.notFound('Gasto no encontrado', 'EXPENSE_NOT_FOUND');

  return toExpenseDTO(expense);
}

async function updateExpense(
  landlordId: string,
  unitId: string,
  expenseId: string,
  data: Partial<{ date: string; category: string; concept: string; amount: string }>,
): Promise<ExpenseDTO> {
  const unit = await Unit.findOne({ _id: unitId, landlordId });
  if (!unit) throw AppError.notFound('Unidad no encontrada', 'UNIT_NOT_FOUND');

  const updateData: Record<string, unknown> = {};
  if (data.date) updateData.date = new Date(data.date);
  if (data.category) updateData.category = data.category;
  if (data.concept) updateData.concept = data.concept;
  if (data.amount) updateData.amount = toDecimal128(data.amount);

  const expense = await Expense.findOneAndUpdate(
    { _id: expenseId, unitId },
    { $set: updateData },
    { new: true },
  ).lean();

  if (!expense) throw AppError.notFound('Gasto no encontrado', 'EXPENSE_NOT_FOUND');
  return toExpenseDTO(expense);
}

async function deleteExpense(landlordId: string, unitId: string, expenseId: string): Promise<void> {
  const unit = await Unit.findOne({ _id: unitId, landlordId });
  if (!unit) throw AppError.notFound('Unidad no encontrada', 'UNIT_NOT_FOUND');

  const result = await Expense.deleteOne({ _id: expenseId, unitId });
  if (result.deletedCount === 0) {
    throw AppError.notFound('Gasto no encontrado', 'EXPENSE_NOT_FOUND');
  }
}

export const expenseService = {
  createExpense,
  listExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
  toExpenseDTO,
};
