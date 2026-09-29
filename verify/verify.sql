-- Runs every snippet from js/questions.js on a scratch database and prints
-- what PostgreSQL does. Run on an EMPTY database: it creates tables.
--   createdb scratch && psql -d scratch -X -f verify/verify.sql

\set ECHO none
\pset footer off
-- seed ------------------------------------------------------------------
CREATE TABLE students (id INT, name TEXT, city TEXT, roll_no TEXT);
INSERT INTO students VALUES (1,'A','Delhi','1'),(2,'B','Pune','10'),(3,'C','Delhi','2'),(4,'D','Goa','11');
CREATE TABLE employees (id INT PRIMARY KEY, name TEXT, dept TEXT, salary NUMERIC, bonus NUMERIC, manager_id INT);
INSERT INTO employees VALUES (1,'Ceo','Mgmt',200000,NULL,NULL),(2,'Asha','IT',90000,5000,1),(3,'Ravi','IT',70000,NULL,2),(4,'Meena','Sales',60000,1000,1),(5,'Kiran','Sales',50000,NULL,4);
CREATE TABLE customers (id INT PRIMARY KEY, name TEXT, phone TEXT);
INSERT INTO customers VALUES (1,'X','1'),(2,'Y',NULL),(3,'Z','3');
CREATE TABLE orders (id INT, customer_id INT, amount NUMERIC, status TEXT, coupon_code TEXT, order_date TIMESTAMP);
INSERT INTO orders VALUES (1,1,500,'DELIVERED',NULL,'2026-01-31 15:00'),(2,1,1500,'PENDING','X','2026-01-10'),(3,NULL,700,'DELIVERED',NULL,'2025-01-05');
CREATE TABLE payments (customer_id INT, amount NUMERIC);
INSERT INTO payments VALUES (1,100),(1,200);
CREATE TABLE products (id INT, name TEXT, category TEXT, price NUMERIC);
INSERT INTO products VALUES (1,'Big book','Books',900),(2,'Car','Toys',300),(3,'Kite','Toys',800);
CREATE TABLE users (name TEXT); INSERT INTO users VALUES ('Aman'),('Aditi');
CREATE TABLE people (first_name TEXT, middle_name TEXT, last_name TEXT);
INSERT INTO people VALUES ('Ram',NULL,'Das'),('Sita','K','Rao');
CREATE TABLE results (passed INT); INSERT INTO results VALUES (1),(1),(0);
CREATE TABLE reviews (rating INT); INSERT INTO reviews VALUES (5),(3),(NULL),(NULL);
CREATE TABLE courses (title TEXT);
CREATE TABLE ads (campaign TEXT, clicks INT, impressions INT); INSERT INTO ads VALUES ('a',1,0);

\echo '--- Q1 double quotes'
SELECT name FROM students WHERE city = "Delhi";
\echo '--- Q2 order of clauses'
SELECT id, name FROM employees ORDER BY salary DESC WHERE dept = 'IT';
\echo '--- Q3 reserved word'
CREATE TABLE order (id SERIAL PRIMARY KEY, item TEXT NOT NULL);
\echo '--- Q4 apostrophe (backslash distractor)'
SELECT 'Rich Dad\'s Guide';
\echo '--- Q4 fix'
SELECT 'Rich Dad''s Guide';
\echo '--- Q5 alias in WHERE'
SELECT name, salary * 12 AS annual FROM employees WHERE annual > 600000;
\echo '--- Q6 case folding'
CREATE TABLE "Students" (id INT, name TEXT);
SELECT * FROM Students;
\echo '--- Q7 = NULL'
SELECT count(*) FROM orders WHERE coupon_code = NULL;
\echo '--- Q8 NOT IN with NULL (customer 2,3 never ordered; orders has NULL customer_id)'
SELECT name FROM customers WHERE id NOT IN (SELECT customer_id FROM orders);
\echo '--- Q9 precedence'
SELECT name FROM products WHERE category = 'Books' OR category = 'Toys' AND price < 500;
\echo '--- Q10 LIKE'
SELECT count(*) FROM users WHERE name LIKE 'a%';
SELECT count(*) FROM users WHERE name ILIKE 'a%';
\echo '--- Q11 BETWEEN timestamp (order 1 at 15:00 on 31st)'
SELECT id FROM orders WHERE order_date BETWEEN '2026-01-01' AND '2026-01-31';
\echo '--- Q12/13 NULL arithmetic + concat; + on text distractor'
SELECT name, salary + bonus FROM employees WHERE bonus IS NULL LIMIT 1;
SELECT first_name || ' ' || middle_name || ' ' || last_name FROM people;
SELECT CONCAT_WS(' ', first_name, middle_name, last_name) FROM people;
SELECT first_name + ' ' + last_name FROM people;
\echo '--- Q14 GROUP BY'
SELECT dept, name, AVG(salary) FROM employees GROUP BY dept;
\echo '--- Q15 aggregate in WHERE'
SELECT dept, COUNT(*) FROM employees WHERE COUNT(*) > 5 GROUP BY dept;
\echo '--- Q16 alias in HAVING'
SELECT dept, AVG(salary) AS avg_sal FROM employees GROUP BY dept HAVING avg_sal > 50000;
\echo '--- Q17 COUNT(col)'
SELECT COUNT(phone), COUNT(*) FROM customers;
\echo '--- Q18 integer division'
SELECT SUM(passed) / COUNT(*) * 100, SUM(passed) * 100.0 / COUNT(*) FROM results;
\echo '--- Q19 AVG null'
SELECT AVG(rating), AVG(COALESCE(rating,0)) FROM reviews;
\echo '--- Q21 ambiguous'
SELECT id, name, amount FROM customers c JOIN orders o ON c.id = o.customer_id;
\echo '--- Q23 JOIN without ON'
SELECT s.name, c.title FROM students s JOIN courses c;
\echo '--- Q24 fan-out (real paid = 300)'
SELECT c.name, SUM(p.amount) AS paid FROM customers c JOIN orders o ON o.customer_id = c.id JOIN payments p ON p.customer_id = c.id GROUP BY c.name;
\echo '--- Q25 table name after alias'
SELECT customers.name, o.amount FROM customers c JOIN orders o ON o.customer_id = c.id;
\echo '--- Q27 text = int'
CREATE TABLE orders_t (customer_id TEXT, amount NUMERIC);
SELECT c.name, o.amount FROM orders_t o JOIN customers c ON o.customer_id = c.id;
\echo '--- Q28 multi-row subquery'
SELECT name FROM employees WHERE salary = (SELECT MAX(salary) FROM employees GROUP BY dept);
\echo '--- Q29 CTE semicolon'
WITH big_orders AS (SELECT * FROM orders WHERE amount > 1000);
\echo '--- Q31 missing RECURSIVE'
WITH nums AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM nums WHERE n < 5) SELECT * FROM nums;
\echo '--- Q32 too many columns'
SELECT name FROM customers WHERE id IN (SELECT customer_id, amount FROM orders WHERE amount > 500);
\echo '--- Q33 alias in WHERE / window in WHERE'
SELECT name, RANK() OVER (ORDER BY salary DESC) AS rnk FROM employees WHERE rnk <= 3;
SELECT name FROM employees WHERE RANK() OVER (ORDER BY salary DESC) <= 3;
\echo '--- Q36 LAST_VALUE default frame'
SELECT name, dept, LAST_VALUE(name) OVER (PARTITION BY dept ORDER BY salary) AS top_earner FROM employees ORDER BY dept, salary;
\echo '--- Q37 RANK gap'
CREATE TABLE sal (salary INT); INSERT INTO sal VALUES (90000),(90000),(80000);
SELECT salary FROM (SELECT salary, RANK() OVER (ORDER BY salary DESC) AS r FROM sal) t WHERE r = 2;
SELECT salary FROM (SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS r FROM sal) t WHERE r = 2;
\echo '--- Q38 FK to non-unique'
CREATE TABLE departments (code TEXT, name TEXT);
CREATE TABLE emp2 (id INT PRIMARY KEY, dept_code TEXT REFERENCES departments(code));
\echo '--- Q39 add NOT NULL column to populated table'
ALTER TABLE employees ADD COLUMN email TEXT NOT NULL;
\echo '--- Q40 SERIAL after explicit ids'
CREATE TABLE t (id SERIAL PRIMARY KEY, v TEXT);
INSERT INTO t (id, v) VALUES (1, 'a'), (2, 'b');
INSERT INTO t (v) VALUES ('c');
\echo '--- Q41 stray semicolon'
CREATE TABLE e41 AS SELECT * FROM employees;
UPDATE e41 SET salary = salary * 1.10;
WHERE dept = 'Sales';
SELECT count(*) AS raised FROM e41 e JOIN employees o USING (id) WHERE e.salary <> o.salary;
\echo '--- Q42 UNIQUE + NULL'
CREATE TABLE members (email TEXT UNIQUE);
INSERT INTO members VALUES (NULL);
INSERT INTO members VALUES (NULL);
SELECT count(*) FROM members;
\echo '--- Q43 aborted transaction'
CREATE TABLE accounts (id INT PRIMARY KEY, bal INT);
BEGIN;
INSERT INTO accounts VALUES (1, 500);
INSERT INTO accounts VALUES (1, 700);
INSERT INTO accounts VALUES (2, 300);
COMMIT;
SELECT count(*) AS rows_left FROM accounts;
\echo '--- Q44 varchar'
CREATE TABLE u44 (phone VARCHAR(10));
INSERT INTO u44 VALUES ('+91-9876543210');
\echo '--- Q45 cast'
SELECT CAST('12.5' AS INTEGER);
SELECT '12.5'::NUMERIC::INT;
\echo '--- Q46 text sort'
SELECT string_agg(roll_no, ',' ORDER BY roll_no) FROM students;
\echo '--- Q47 round float'
SELECT ROUND(AVG(price)::FLOAT, 2) FROM products;
SELECT ROUND(AVG(price)::NUMERIC, 2) FROM products;
\echo '--- Q48 div zero'
SELECT campaign, clicks * 100.0 / impressions FROM ads;
SELECT campaign, clicks * 100.0 / NULLIF(impressions,0) FROM ads;
\echo '--- Q49 month merge'
SELECT EXTRACT(MONTH FROM order_date) AS m, SUM(amount) FROM orders GROUP BY m ORDER BY m;
\echo '--- Q50 MI vs MM'
SELECT TO_CHAR(TIMESTAMP '2026-03-14 09:37', 'YYYY-MI-DD');
