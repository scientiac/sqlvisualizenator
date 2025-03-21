-- simple library database
-- first, let's drop the tables if they already exist
drop table if exists authors;
drop table if exists books;
drop table if exists publishers;
drop table if exists book_authors;

-- create authors table
create table authors (
    author_id integer primary key,
    name text not null,
    birth_year integer
);

-- create publishers table
create table publishers (
    publisher_id integer primary key,
    name text not null,
    address text
);

-- create books table
create table books (
    book_id integer primary key,
    title text not null,
    publisher_id integer,
    publication_year integer,
    foreign key (publisher_id) references publishers(publisher_id)
);

-- create a table for the many-to-many relationship between books and authors
create table book_authors (
    book_id integer,
    author_id integer,
    primary key (book_id, author_id),
    foreign key (book_id) references books(book_id),
    foreign key (author_id) references authors(author_id)
);

-- insert some sample authors
insert into authors (name, birth_year) values
('george orwell', 1903),
('aldous huxley', 1894),
('ray bradbury', 1920);

-- insert some sample publishers
insert into publishers (name, address) values
('secker & warburg', 'london, uk'),
('harpercollins', 'new york, usa');

-- insert some sample books
insert into books (title, publisher_id, publication_year) values
('1984', 1, 1949),
('brave new world', 2, 1932),
('fahrenheit 451', 3, 1953);

-- link books to their authors
insert into book_authors (book_id, author_id) values
-- 1984 by george orwell
(1, 1), 
-- brave new world by aldous huxley
(2, 2), 
-- fahrenheit 451 by ray bradbury
(3, 3); 
