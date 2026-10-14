export type AccountPayment = {
  id: string;
  date: string;
  type: string;
  status: string;
  reference: string | null;
  description: string;
  amount: number | null;
  currency: string;
  batchId?: string | null;
  productCharges?: number | null;
  otherAmount?: number | null;
};
