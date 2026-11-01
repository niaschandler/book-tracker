# Dashboard read-count test evidence

The integration test creates one authenticated reader with three book entries: one marked read, one in progress, and one on the want-to-read shelf. The dashboard should report 3 total books and 1 book read.

Run it with:

```sh
pnpm --filter @workspace/api-server run test:dashboard-read-count
```

## Deliberately failing run

The test failed when the dashboard calculation was temporarily changed to count every library entry as read: it returned 3 instead of 1. That temporary bug was reverted and is not included in this branch.

![Failing dashboard read-count test](dashboard-read-count-failing.jpg)

## Passing run after restore

After restoring the [0mread-status filter, the same test passed with [0mreadCount = 1 and totalBooks = 3.

![Passing dashboard read-count test](dashboard-read-count-passing.jpg)

A real regression that this test catches is removing or changing the [0mstatus === "read"[0m filter in [0mcomputeDashboardSummary[0m, or setting the read count to the total number of library entries.
