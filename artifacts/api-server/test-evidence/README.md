# Dashboard read-count test evidence

    The API integration test creates one authenticated reader with three entries: one marked read, one in progress, and one on the want-to-read shelf. The dashboard should report 3 total books and 1 book read.

    Run it with:

      pnpm --filter @workspace/api-server run test:dashboard-read-count

    ## Deliberately failing run

    The test failed when the dashboard calculation was temporarily changed to count every library entry as read: it returned 3 instead of 1. That temporary bug was reverted and is not included in this branch.

    ![Failing dashboard read-count test](dashboard-read-count-failing.jpg)

    ## Passing run after restore

    After restoring the read-status filter, the same test passed with readCount 1 and totalBooks 3.

    ![Passing dashboard read-count test](dashboard-read-count-passing.jpg)

    A real regression this catches is removing or changing the read-status filter in the dashboard summary calculation, or using the total number of entries as the read count.
    