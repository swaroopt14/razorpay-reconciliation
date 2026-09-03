import { redirect } from 'next/navigation'

/** Transactions is the merchant name for the Intent Journal. */
export default function TransactionsRedirectPage() {
  redirect('/sandbox?dock=grid&demo=sandbox')
}
