import type { QueryClient } from "@tanstack/react-query";
import {
  getExportBooksQueryKey, getGetDashboardSummaryQueryKey,
  getListBooksQueryKey, getPickNextBookQueryKey,
} from "@workspace/api-client-react";

export async function refreshLibrary(client: QueryClient) {
  await Promise.all([
    getListBooksQueryKey(), getGetDashboardSummaryQueryKey(),
    getPickNextBookQueryKey(), getExportBooksQueryKey(),
  ].map((queryKey) => client.invalidateQueries({ queryKey })));
}
