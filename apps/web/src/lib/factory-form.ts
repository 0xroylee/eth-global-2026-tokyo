import { parseUnits, type Address } from "@boss-pool/chain";

export function sameAddressText(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function isCurrentTokenResponse(
  requestedToken: Address | string,
  currentToken: string,
  requestedAccount: Address | undefined,
  currentAccount: Address | undefined,
): boolean {
  return sameAddressText(requestedToken, currentToken) &&
    (requestedAccount === undefined || currentAccount === undefined
      ? requestedAccount === currentAccount
      : sameAddressText(requestedAccount, currentAccount));
}

export function isCurrentQuoteResponse(
  request: number,
  latestRequest: number,
  requestedAccount: Address | undefined,
  currentAccount: Address | undefined,
  requestedToken: Address | string,
  currentToken: string,
): boolean {
  return request === latestRequest && isCurrentTokenResponse(requestedToken, currentToken, requestedAccount, currentAccount);
}

export function parseStrictUnits(value: string, decimals: number): bigint {
  const amount = value.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(amount)) throw new Error("Enter a valid positive decimal amount.");
  const fractionalDigits = amount.split(".")[1]?.length ?? 0;
  if (fractionalDigits > decimals) throw new Error(`Use no more than ${decimals} decimal places for this amount.`);
  return parseUnits(amount, decimals);
}
