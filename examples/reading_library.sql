select b.title, a.name as author, p.name as publisher
from books b
join book_authors ba on b.book_id = ba.book_id
join authors a on ba.author_id = a.author_id
join publishers p on b.publisher_id = p.publisher_id;

select a.name as author, b.title
from authors a
join book_authors ba on a.author_id = ba.author_id
join books b on ba.book_id = b.book_id;

select p.name as publisher, b.title
from publishers p
join books b on p.publisher_id = b.publisher_id;

select name, birth_year
from authors
where birth_year > 1900;
