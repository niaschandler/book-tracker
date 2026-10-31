# book-tracker
A real list of things I've read and meant to read
1. I'm building a book tracker because I want to keep track of what I've read and things I'm interested in reading. I will use this when I find something I think I want to read, I buy a new book, or I finish reading a book.
2. Features 
   1.  Sign up and login | A new visitor can create their own account from inside the app, then log in and log out. Every account is a row in the users table. Each user sees only their own data.
   2. Data model | A users table plus authors, titles, genres, page lengths, user rating, read/bought/want to read
   3. Create / read / update / delete | Add a book, view the list, open one book's detail page, edit it, and delete it with an "are you sure?" confirmation.
   4. Validation | Required fields can't be left blank. Show a friendly message if someone tries.
   5. Stars | Users can star items and see a "starred" view. All stars live in one stars table (a junction table) where each row references a user and an item: "this user starred this item." One table for everyone, not one per user.
   6. Find things | Search or filter, plus sort (e.g., newest first, highest rated).
   7. Dashboard | At least one chart and summary stats computed from your data (books, pages, genres, average rating, longest book, fastest read).
   8. Virtual Bookshelf | As a proud book hoarder, I want to see everything I've read, so that I can be proud of my collection.
   9. “What next?” picker | random pick from your Want to Read list, filtered by mood, length, or genre. As a rom-com fan, I want to broaden my genre selections, so that I'm not only reading one type of book.
   10. Export | Users can download their data as a spreadsheet. As an infrequent tech user, I want to be able to take me data with me, so that it's not stuck in one app.

3. Database | diagram:

<img width="1514" height="1696" alt="Image" src="https://github.com/user-attachments/assets/9781946c-0f74-4ba9-93ba-175975159ea2" />

4. Tests
   1.  Data isolation: Ensures that each user can see only their own data and not that of any other user. Given User A is logged in, when User B is logged in, then User B cannot see User A's data.
   2. Dashboard: Ensures the app correctly counts the number of books a user has read, not all entries they have made. Given a specific user who has made book entries, when books have been marked as read, then dashboard provides correct total number of books read.
5. Technologies | I will use Replit as the coding agent because I've never used anything else. I'll host it in github because I think that will be more effective than a Replit app. Users will sign up with an email and password. I'd like to pull book data from openlibrary.org so that book data is more complete and can pull an image of the covers.
6. Design | I want to feel like I've walked into a grand library, like at a prestigious university or an old public library in a big city. 
7. Risks and cuts | I'm not sure how to build the virtual bookshelf, so if I run out of time I will not make that, or will make it much simpler than I'd like, if I can't figure out how to make what I'm envisioning.
