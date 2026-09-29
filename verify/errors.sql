-- Runs every "Error -> fix" snippet (questions with an e field) and each
-- intended fix. Run on an EMPTY database: it creates tables and a role.
--   createdb scratch2 && psql -d scratch2 -X -f verify/errors.sql
\pset footer off
-- seed ------------------------------------------------------------------
CREATE TABLE customers (id INT PRIMARY KEY, name TEXT, city TEXT);
INSERT INTO customers VALUES (1,'X','Pune'),(7,'Y','Goa');
CREATE TABLE orders (id INT PRIMARY KEY, customer_id INT REFERENCES customers(id), amount NUMERIC, order_date TIMESTAMPTZ);
INSERT INTO orders VALUES (1,7,900,now());
CREATE TABLE employees (id INT, name TEXT, age INT, salary NUMERIC, bonus NUMERIC, phone TEXT);
INSERT INTO employees VALUES (1,'A',30,100,NULL,'9876543210');
CREATE TABLE students (id INT, name TEXT, city TEXT);
CREATE TABLE teachers (name TEXT);

\echo '--- N1 missing FROM-clause entry'
SELECT c.name, o.amount
FROM customers c
WHERE o.amount > 500;
\echo '--- N2 schema not on search_path'
CREATE SCHEMA hr;
CREATE TABLE hr.staff (id INT, name TEXT);
SELECT * FROM staff;
SELECT count(*) FROM hr.staff;
\echo '--- N3 sum(text)'
CREATE TABLE sales (region TEXT, amount TEXT);
SELECT region, SUM(amount) FROM sales GROUP BY region;
SELECT region, SUM(amount::NUMERIC) FROM sales GROUP BY region;
\echo '--- N4 empty string into INT'
INSERT INTO employees (id, name, age) VALUES (7, 'Neha', '');
INSERT INTO employees (id, name, age) VALUES (7, 'Neha', NULL);
\echo '--- N5 date out of range, both datestyles'
CREATE TABLE events (title TEXT, event_date DATE);
SET datestyle = 'ISO, MDY';
INSERT INTO events VALUES ('Fest', '2026-31-01');
SET datestyle = 'ISO, DMY';
INSERT INTO events VALUES ('Fest', '2026-31-01');
INSERT INTO events VALUES ('Fest', '2026-01-31');
INSERT INTO events VALUES ('Fest', TO_DATE('31/01/2026', 'DD/MM/YYYY'));
RESET datestyle;
\echo '--- N6 not-null'
CREATE TABLE users (id INT PRIMARY KEY, email TEXT NOT NULL);
INSERT INTO users (id) VALUES (1);
\echo '--- N7 check'
CREATE TABLE products (id INT PRIMARY KEY, price NUMERIC CHECK (price > 0));
INSERT INTO products VALUES (1, -50);
\echo '--- N8 FK insert'
INSERT INTO orders (id, customer_id, amount) VALUES (2, 99, 450);
\echo '--- N9 FK delete'
DELETE FROM customers WHERE id = 7;
\echo '--- N11 more expressions'
INSERT INTO students (id, name) VALUES (1, 'Asha', 'Delhi');
\echo '--- N12 ON CONFLICT without unique'
CREATE TABLE subscribers (email TEXT, name TEXT);
INSERT INTO subscribers (email, name) VALUES ('a@x.com', 'Asha') ON CONFLICT (email) DO NOTHING;
ALTER TABLE subscribers ADD UNIQUE (email);
INSERT INTO subscribers (email, name) VALUES ('a@x.com', 'Asha') ON CONFLICT (email) DO NOTHING;
\echo '--- N13 UNION column count'
SELECT name, city FROM students UNION SELECT name FROM teachers;
\echo '--- N14 UNION types'
SELECT id FROM students UNION SELECT name FROM teachers;
\echo '--- N15 WHERE int'
CREATE TABLE members (name TEXT, active INT);
SELECT name FROM members WHERE active;
\echo '--- N16 timestamptz - integer'
SELECT * FROM orders WHERE order_date > NOW() - 7;
SELECT count(*) FROM orders WHERE order_date > NOW() - INTERVAL '7 days';
\echo '--- N17 ORDER BY position'
SELECT name, salary FROM employees ORDER BY 3;
\echo '--- N18 DISTINCT + ORDER BY'
SELECT DISTINCT city FROM customers ORDER BY name;
\echo '--- N19 TOP'
SELECT TOP 5 name, salary FROM employees ORDER BY salary DESC;
\echo '--- N20 IFNULL'
SELECT name, IFNULL(bonus, 0) FROM employees;
\echo '--- N22 RANK without OVER'
SELECT name, salary, RANK() FROM employees;
\echo '--- N24 two PRIMARY KEY constraints'
CREATE TABLE enrollments (student_id INT PRIMARY KEY, course_id INT PRIMARY KEY);
CREATE TABLE enrollments (student_id INT, course_id INT, PRIMARY KEY (student_id, course_id));
\echo '--- N25 already exists'
CREATE TABLE orders (id INT);
CREATE TABLE IF NOT EXISTS orders (id INT);
\echo '--- N26 identity always'
CREATE TABLE tickets (id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, title TEXT);
INSERT INTO tickets (id, title) VALUES (1, 'Login bug');
INSERT INTO tickets (title) VALUES ('Login bug');
\echo '--- N27 alter type without USING'
ALTER TABLE employees ALTER COLUMN phone TYPE BIGINT;
ALTER TABLE employees ALTER COLUMN phone TYPE BIGINT USING phone::BIGINT;
\echo '--- N28 permission denied'
CREATE TABLE salaries (emp_id INT, amount NUMERIC);
CREATE ROLE intern;
SET ROLE intern;
SELECT * FROM salaries;
RESET ROLE;
GRANT SELECT ON salaries TO intern;
SET ROLE intern;
SELECT count(*) FROM salaries;
RESET ROLE;
