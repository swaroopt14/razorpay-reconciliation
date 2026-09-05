import { fetchProdJsonGet } from './fetchProdJsonGet'
import type { ApiListResponse, ApiPayoutContract } from './prodApiTypes'

export const PROD_PAYOUT_CONTRACTS_PATH = '/api/prod/payout-contracts'

export async function getProdPayoutContracts(): Promise<ApiListResponse<ApiPayoutContract> | null> {
  return fetchProdJsonGet<ApiListResponse<ApiPayoutContract>>(PROD_PAYOUT_CONTRACTS_PATH)
}
