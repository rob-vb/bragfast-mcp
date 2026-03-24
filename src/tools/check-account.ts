import { BragfastApiClient } from "../lib/api-client.js";
import type { AccountInfo } from "../lib/types.js";

export async function checkAccount(client: BragfastApiClient): Promise<AccountInfo> {
  return client.get<AccountInfo>("/account");
}
