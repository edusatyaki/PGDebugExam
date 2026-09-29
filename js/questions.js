/* =====================================================================
   PostgreSQL Debugging Test — question bank (50 questions)

   Every question shows a snippet with a bug in it. Students pick the cause,
   the fix, or what PostgreSQL will actually do. Each error message and
   behaviour quoted below was checked against a live PostgreSQL 16 server.

   Format:
     t = topic (drives the breakdown chart)
     q = question text          (`backticks` render as inline code)
     c = the SQL snippet        (rendered as a highlighted code block)
     o = exactly four options   (`backticks` render as inline code)
     a = index of the correct option (0–3)
   ===================================================================== */

const QUESTIONS = [

  /* ---------- Syntax & Quoting (6) ---------- */
  { t: "Syntax & Quoting", a: 1,
    q: "This query fails with `column \"Delhi\" does not exist`. What is the bug?",
    c: `SELECT name
FROM students
WHERE city = "Delhi";`,
    o: ["Column names in WHERE must be upper case, so `city` has to be written `CITY`",
        "Double quotes mark an identifier — a string literal needs single quotes: 'Delhi'",
        "`=` cannot compare TEXT values in PostgreSQL — the filter has to use `LIKE`",
        "A literal in WHERE needs an explicit cast, so it should read `\"Delhi\"::TEXT`"] },

  { t: "Syntax & Quoting", a: 0,
    q: "PostgreSQL reports `syntax error at or near \"WHERE\"`. Which change fixes it?",
    c: `SELECT id, name
FROM employees
ORDER BY salary DESC
WHERE dept = 'IT';`,
    o: ["Move `WHERE dept = 'IT'` above the `ORDER BY` line",
        "Replace `WHERE` with `HAVING`, since it follows ORDER BY",
        "Insert `GROUP BY dept` between ORDER BY and WHERE",
        "Write the literal in double quotes: `dept = \"IT\"`"] },

  { t: "Syntax & Quoting", a: 2,
    q: "Why does this table definition fail?",
    c: `CREATE TABLE order (
  id   SERIAL PRIMARY KEY,
  item TEXT NOT NULL
);`,
    o: ["`SERIAL` and `PRIMARY KEY` cannot be declared on the same column",
        "A `TEXT` column cannot carry a `NOT NULL` constraint",
        "`ORDER` is a reserved keyword — rename the table or quote it",
        "Column names must be aligned with single spaces, not padded"] },

  { t: "Syntax & Quoting", a: 1,
    q: "The second row breaks this INSERT. What is the correct fix?",
    c: `INSERT INTO books (title, author)
VALUES ('Atomic Habits', 'James Clear'),
       ('Rich Dad's Guide', 'R. Kiyosaki');`,
    o: ["Escape it with a backslash: `'Rich Dad\\'s Guide'`",
        "Double the apostrophe: `'Rich Dad''s Guide'`",
        "Switch to double quotes: `\"Rich Dad's Guide\"`",
        "Put each row in its own INSERT statement"] },

  { t: "Syntax & Quoting", a: 3,
    q: "This fails with `column \"annual\" does not exist`. Why?",
    c: `SELECT name, salary * 12 AS annual
FROM employees
WHERE annual > 600000;`,
    o: ["Aliases on computed columns must be written in double quotes to be referenced later",
        "`AS` can only rename existing columns, not the result of an arithmetic expression",
        "Numeric literals above 100000 need an explicit `::NUMERIC` cast in a comparison",
        "WHERE is evaluated before SELECT, so the alias does not exist yet — repeat `salary * 12`"] },

  { t: "Syntax & Quoting", a: 1,
    q: "The CREATE succeeds, yet the SELECT fails with `relation \"students\" does not exist`. Why?",
    c: `CREATE TABLE "Students" (id INT, name TEXT);

SELECT * FROM Students;`,
    o: ["`SELECT *` is not permitted on a table created earlier in the same session",
        "Unquoted names fold to lower case — it must be written `\"Students\"`",
        "The new table has no rows yet, and PostgreSQL reports an empty table as missing",
        "Table names must be singular, so PostgreSQL rejects `Students` on lookup"] },


  /* ---------- Filtering & NULLs (7) ---------- */
  { t: "Filtering & NULLs", a: 3,
    q: "Many orders were placed without a coupon, but this returns zero rows and no error. Why?",
    c: `SELECT *
FROM orders
WHERE coupon_code = NULL;`,
    o: ["NULL has to be quoted as a string: `coupon_code = 'NULL'`",
        "`coupon_code` needs an index before it can be compared to NULL",
        "`SELECT *` drops any row whose columns contain a NULL",
        "`= NULL` yields NULL, never true — the test must be `IS NULL`"] },

  { t: "Filtering & NULLs", a: 1,
    q: "Several customers have never ordered, yet this returns 0 rows. Most likely cause?",
    c: `SELECT name
FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders);`,
    o: ["`NOT IN` accepts only a literal list such as `(1, 2, 3)`, never a subquery",
        "`orders.customer_id` holds a NULL, so `NOT IN` is never true — use `NOT EXISTS`",
        "The subquery returns duplicates, and `NOT IN` needs `DISTINCT` to work",
        "`NOT IN` requires both columns to have the same name, e.g. `customer_id`"] },

  { t: "Filtering & NULLs", a: 2,
    q: "Intent: Books or Toys, both priced under 500. Expensive books still appear. Why?",
    c: `SELECT name, category, price
FROM products
WHERE category = 'Books'
   OR category = 'Toys' AND price < 500;`,
    o: ["An `OR` condition cannot continue onto a new line without a backslash",
        "The price filter must be written first so it applies to every category",
        "`AND` binds tighter than `OR` — wrap the two category tests in parentheses",
        "Comparisons on TEXT columns make PostgreSQL skip the numeric filter"] },

  { t: "Filtering & NULLs", a: 1,
    q: "The table contains 'Aman' and 'Aditi', but this returns no rows. Which fix works?",
    c: `SELECT name
FROM users
WHERE name LIKE 'a%';`,
    o: ["`WHERE name LIKE 'a*'`",
        "`WHERE name ILIKE 'a%'`",
        "`WHERE name = 'a%'`",
        "`WHERE name LIKE \"a%\"`"] },

  { t: "Filtering & NULLs", a: 0,
    q: "`order_date` is a TIMESTAMP. Orders placed on the afternoon of 31 January are missing. Why?",
    c: `SELECT *
FROM orders
WHERE order_date BETWEEN '2026-01-01' AND '2026-01-31';`,
    o: ["`'2026-01-31'` means 00:00 on the 31st — use `< '2026-02-01'`",
        "`BETWEEN` excludes both end points, so neither 1 nor 31 January is included",
        "Date literals must be written DD-MM-YYYY, so the upper bound was misread",
        "`BETWEEN` compares only the time part of a TIMESTAMP, not the date part"] },

  { t: "Filtering & NULLs", a: 0,
    q: "Employees with no bonus get a NULL `total_pay`. Which rewrite is correct?",
    c: `SELECT name, salary + bonus AS total_pay
FROM employees;`,
    o: ["`salary + COALESCE(bonus, 0)`",
        "`salary + NULLIF(bonus, 0)`",
        "`salary + bonus IS NOT NULL`",
        "`SUM(salary, bonus)`"] },

  { t: "Filtering & NULLs", a: 0,
    q: "People without a middle name get a NULL `full_name`. Which rewrite fixes it cleanly?",
    c: `SELECT first_name || ' ' || middle_name || ' ' || last_name
         AS full_name
FROM people;`,
    o: ["`CONCAT_WS(' ', first_name, middle_name, last_name)`",
        "`first_name + ' ' + middle_name + ' ' + last_name`",
        "`TRIM(first_name || middle_name || last_name)`",
        "`NULLIF(first_name || ' ' || middle_name, '')`"] },


  /* ---------- GROUP BY & Aggregates (7) ---------- */
  { t: "GROUP BY & Aggregates", a: 1,
    q: "What does PostgreSQL report?",
    c: `SELECT dept, name, AVG(salary)
FROM employees
GROUP BY dept;`,
    o: ["`aggregate functions are not allowed in GROUP BY`",
        "`column \"employees.name\" must appear in the GROUP BY clause…`",
        "`column reference \"dept\" is ambiguous` — it exists in two scopes",
        "No error — PostgreSQL returns one row per employee, with each salary"] },

  { t: "GROUP BY & Aggregates", a: 3,
    q: "Goal: departments with more than 5 employees. Why does it fail?",
    c: `SELECT dept, COUNT(*)
FROM employees
WHERE COUNT(*) > 5
GROUP BY dept;`,
    o: ["`COUNT(*)` is not valid in a condition and has to be written `COUNT(1)` there",
        "WHERE must be placed after GROUP BY whenever the query aggregates",
        "`COUNT(*)` needs an alias in SELECT before it can be compared in WHERE",
        "Aggregates are not allowed in WHERE — filter the groups with `HAVING COUNT(*) > 5`"] },

  { t: "GROUP BY & Aggregates", a: 1,
    q: "This works in MySQL but fails in PostgreSQL with `column \"avg_sal\" does not exist`. Why?",
    c: `SELECT dept, AVG(salary) AS avg_sal
FROM employees
GROUP BY dept
HAVING avg_sal > 50000;`,
    o: ["HAVING must appear before GROUP BY, so PostgreSQL has not seen the alias yet",
        "PostgreSQL does not allow SELECT aliases in HAVING — write `HAVING AVG(salary) > 50000`",
        "`AVG` returns TEXT in PostgreSQL, so the alias cannot be compared with a number",
        "HAVING can only reference an alias when the query also has an ORDER BY"] },

  { t: "GROUP BY & Aggregates", a: 2,
    q: "`customers` has 100 rows, but this returns 82. What explains the gap?",
    c: `SELECT COUNT(phone) AS total_customers
FROM customers;`,
    o: ["`COUNT` on a TEXT column counts distinct values only, so duplicates are dropped",
        "18 rows are locked by another session, and COUNT skips locked rows",
        "`COUNT(phone)` skips rows where phone is NULL — `COUNT(*)` counts every row",
        "`COUNT` stops at the first duplicate phone number it meets"] },

  { t: "GROUP BY & Aggregates", a: 2,
    q: "`passed` is an INT column holding 1 or 0. The pass percentage always comes out as 0. Fix?",
    c: `SELECT SUM(passed) / COUNT(*) * 100 AS pass_pct
FROM results;`,
    o: ["`SUM(passed) / COUNT(*) * 100.0`",
        "`ROUND(SUM(passed) / COUNT(*) * 100)`",
        "`SUM(passed) * 100.0 / COUNT(*)`",
        "`SUM(passed) / COUNT(passed) * 100`"] },

  { t: "GROUP BY & Aggregates", a: 2,
    q: "`rating` holds 5, 3, NULL, NULL. Unrated reviews should count as 0 (expected 2), but this gives 4. Fix?",
    c: `SELECT AVG(rating) AS avg_rating
FROM reviews;`,
    o: ["`AVG(DISTINCT rating)`",
        "`SUM(rating) / COUNT(rating)`",
        "`AVG(COALESCE(rating, 0))`",
        "`AVG(NULLIF(rating, 0))`"] },

  { t: "GROUP BY & Aggregates", a: 0,
    q: "Intent: the top salary in each department. It returns one row per employee instead. Why?",
    c: `SELECT dept, name, MAX(salary)
FROM employees
GROUP BY dept, name;`,
    o: ["Grouping by `name` makes each employee a group of one",
        "`MAX` works only on integer columns, so it returns each salary unchanged",
        "GROUP BY columns must be listed in the same order as SELECT, including `MAX`",
        "`MAX` needs `DISTINCT` inside it when more than one column is grouped"] },


  /* ---------- Joins (7) ---------- */
  { t: "Joins", a: 0,
    q: "What does PostgreSQL report?",
    c: `SELECT id, name, amount
FROM customers c
JOIN orders o ON c.id = o.customer_id;`,
    o: ["`column reference \"id\" is ambiguous`",
        "`missing FROM-clause entry for table \"o\"`",
        "`syntax error at or near \"JOIN\"` — INNER is required",
        "`column \"amount\" must appear in the GROUP BY clause`"] },

  { t: "Joins", a: 1,
    q: "Intent: list EVERY customer, with their delivered orders if any. Customers with no orders vanish. Why?",
    c: `SELECT c.name, o.id AS order_id
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'DELIVERED';`,
    o: ["`LEFT JOIN` behaves as an inner join unless it is spelled out as `LEFT OUTER JOIN`",
        "The WHERE filter drops the NULL-extended rows — move the status test into the ON clause",
        "The tables are in the wrong order — `orders` must come first in a LEFT JOIN",
        "`o.status` is compared case-sensitively, so 'DELIVERED' never matches"] },

  { t: "Joins", a: 3,
    q: "Why does this fail with `syntax error at or near \";\"`?",
    c: `SELECT s.name, c.title
FROM students s
JOIN courses c;`,
    o: ["Single-letter aliases such as `s` and `c` are reserved and cannot name tables",
        "`title` is a reserved keyword and must be quoted when it is selected",
        "Two tables cannot be joined unless the query also has a WHERE clause",
        "`JOIN` needs an `ON` or `USING` condition (or use `CROSS JOIN`)"] },

  { t: "Joins", a: 2,
    q: "`paid` comes out several times larger than the customer's real total. Cause?",
    c: `SELECT c.name, SUM(p.amount) AS paid
FROM customers c
JOIN orders   o ON o.customer_id = c.id
JOIN payments p ON p.customer_id = c.id
GROUP BY c.name;`,
    o: ["`SUM` double-counts NUMERIC values unless the column is cast to INT first",
        "GROUP BY must also list `p.amount`, otherwise SUM adds the same value twice",
        "Joining two child tables multiplies rows — every payment repeats once per order",
        "The alias `p` clashes with a system catalog, so extra rows are pulled in"] },

  { t: "Joins", a: 0,
    q: "Which error does this produce?",
    c: `SELECT customers.name, o.amount
FROM customers c
JOIN orders o ON o.customer_id = c.id;`,
    o: ["`invalid reference to FROM-clause entry for table \"customers\"`",
        "`column \"name\" does not exist`",
        "`relation \"c\" does not exist`",
        "No error — table names and aliases are interchangeable"] },

  { t: "Joins", a: 2,
    q: "Intent: each employee next to their manager. The `employee` column lists managers instead. Fix?",
    c: `SELECT e.name AS employee,
       m.name AS manager
FROM employees e
JOIN employees m ON e.id = m.manager_id;`,
    o: ["`LEFT JOIN employees m ON e.id = m.manager_id`",
        "Add `WHERE e.id <> m.id`",
        "`ON e.manager_id = m.id`",
        "`SELECT DISTINCT e.name, m.name`"] },

  { t: "Joins", a: 2,
    q: "`orders.customer_id` was created as TEXT; `customers.id` is INT. What happens?",
    c: `SELECT c.name, o.amount
FROM orders o
JOIN customers c ON o.customer_id = c.id;`,
    o: ["PostgreSQL converts the TEXT side automatically and returns the correct matches",
        "The join runs but compares character codes, so only single-digit ids match",
        "Error `operator does not exist: text = integer` — cast one side",
        "With no usable condition it falls back to returning every combination of rows"] },


  /* ---------- Subqueries & CTEs (5) ---------- */
  { t: "Subqueries & CTEs", a: 3,
    q: "Why does this fail at run time?",
    c: `SELECT name, salary
FROM employees
WHERE salary = (SELECT MAX(salary)
                FROM employees
                GROUP BY dept);`,
    o: ["`MAX` cannot appear inside a subquery that is used in a WHERE clause",
        "A subquery cannot read the same table as its outer query without an alias",
        "GROUP BY is not allowed inside a subquery unless it has a HAVING clause",
        "The subquery returns one row per department, but `=` needs one value — use `IN`"] },

  { t: "Subqueries & CTEs", a: 3,
    q: "Why does this fail with `syntax error at or near \";\"`?",
    c: `WITH big_orders AS (
  SELECT * FROM orders WHERE amount > 1000
);
SELECT * FROM big_orders;`,
    o: ["A CTE body cannot use `SELECT *`; its columns have to be listed explicitly",
        "CTE names may not contain underscores, so `big_orders` is rejected",
        "Every CTE needs the keyword `RECURSIVE`, even when it does not refer to itself",
        "The `;` ends the statement — a CTE lives only inside one statement"] },

  { t: "Subqueries & CTEs", a: 0,
    q: "Intent: employees earning more than their OWN department's average. What is wrong?",
    c: `SELECT e.name, e.dept, e.salary
FROM employees e
WHERE e.salary > (SELECT AVG(salary)
                  FROM employees);`,
    o: ["The subquery is not correlated — add `WHERE dept = e.dept` inside it",
        "`AVG` returns an integer here, so salaries just above average are lost",
        "The subquery must end in `LIMIT 1` to be compared with a single salary",
        "A column cannot be compared with a subquery using `>`, only with `IN`"] },

  { t: "Subqueries & CTEs", a: 3,
    q: "This fails with `relation \"nums\" does not exist`. Fix?",
    c: `WITH nums AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM nums WHERE n < 5
)
SELECT * FROM nums;`,
    o: ["Replace `UNION ALL` with `UNION`",
        "Run `CREATE TABLE nums (n INT)` first",
        "Move `WHERE n < 5` to the outer query",
        "Write `WITH RECURSIVE nums AS (...)`"] },

  { t: "Subqueries & CTEs", a: 2,
    q: "What does PostgreSQL report?",
    c: `SELECT name
FROM customers
WHERE id IN (SELECT customer_id, amount
             FROM orders
             WHERE amount > 500);`,
    o: ["`more than one row returned by a subquery used as an expression`",
        "`column reference \"amount\" is ambiguous`",
        "`subquery has too many columns`",
        "No error — the extra column is ignored"] },


  /* ---------- Window Functions (5) ---------- */
  { t: "Window Functions", a: 2,
    q: "Goal: the top 3 earners. Why does this fail?",
    c: `SELECT name, salary,
       RANK() OVER (ORDER BY salary DESC) AS rnk
FROM employees
WHERE rnk <= 3;`,
    o: ["`RANK()` is only valid with a `PARTITION BY`, which this window is missing",
        "`rnk` is a reserved word and has to be written in double quotes to be used",
        "Window functions run after WHERE — filter in an outer query instead",
        "The filter belongs in `HAVING rnk <= 3`, since rank is a kind of aggregate"] },

  { t: "Window Functions", a: 1,
    q: "Every row shows the same `running_total` — the grand total. Fix?",
    c: `SELECT order_date, amount,
       SUM(amount) OVER () AS running_total
FROM orders;`,
    o: ["Add `GROUP BY order_date`",
        "`SUM(amount) OVER (ORDER BY order_date)`",
        "`SUM(amount) OVER (PARTITION BY amount)`",
        "`COUNT(amount) OVER ()`"] },

  { t: "Window Functions", a: 1,
    q: "Intent: number employees 1, 2, 3… inside each department. Numbering runs across the whole company. Fix?",
    c: `SELECT dept, name, salary,
       ROW_NUMBER() OVER (ORDER BY salary DESC) AS pos
FROM employees;`,
    o: ["`ROW_NUMBER() OVER (ORDER BY dept, salary DESC) AS pos`",
        "`ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC)`",
        "Keep the window as it is and add `GROUP BY dept, name`",
        "`COUNT(*) OVER (ORDER BY salary DESC)`"] },

  { t: "Window Functions", a: 3,
    q: "`top_earner` should be each department's highest-paid person, but it repeats every row's own name. Why?",
    c: `SELECT name, dept, salary,
       LAST_VALUE(name) OVER (
         PARTITION BY dept ORDER BY salary
       ) AS top_earner
FROM employees;`,
    o: ["`LAST_VALUE` only works on numeric columns, so it echoes TEXT values back",
        "`PARTITION BY` must be written after `ORDER BY` inside the OVER clause",
        "`LAST_VALUE` needs `DISTINCT`, otherwise it returns the current value",
        "The default frame stops at the current row — extend it to `UNBOUNDED FOLLOWING`"] },

  { t: "Window Functions", a: 3,
    q: "Salaries are 90000, 90000, 80000. Looking for the 2nd-highest, this returns no rows. Why?",
    c: `SELECT salary
FROM (SELECT salary,
             RANK() OVER (ORDER BY salary DESC) AS r
      FROM employees) t
WHERE r = 2;`,
    o: ["`RANK` numbers from 0, so the second-highest salary is actually `r = 1`",
        "A derived table cannot be aliased with a single letter such as `t`",
        "`DESC` is not allowed inside OVER, so the ranking is silently ignored",
        "`RANK` leaves a gap after a tie (1, 1, 3) — `DENSE_RANK` gives 1, 1, 2"] },


  /* ---------- Constraints & Transactions (6) ---------- */
  { t: "Constraints & Transactions", a: 0,
    q: "The second CREATE fails. Why?",
    c: `CREATE TABLE departments (code TEXT, name TEXT);

CREATE TABLE employees (
  id        INT PRIMARY KEY,
  dept_code TEXT REFERENCES departments(code)
);`,
    o: ["A foreign key must point at a PRIMARY KEY or UNIQUE column — `code` is neither",
        "TEXT columns cannot take part in a foreign key; the key has to be an INT",
        "`departments` must be created after `employees` for the reference to resolve",
        "A column-level `REFERENCES` must be preceded by the words `FOREIGN KEY`"] },

  { t: "Constraints & Transactions", a: 3,
    q: "`employees` already has 200 rows. Why does this fail?",
    c: `ALTER TABLE employees
  ADD COLUMN email TEXT NOT NULL;`,
    o: ["`ALTER TABLE` cannot add a TEXT column to a table that already has data",
        "A table may contain only one NOT NULL column besides its primary key",
        "`ADD COLUMN` is rejected unless it is written as `ADD COLUMN IF NOT EXISTS`",
        "Existing rows would get NULL in a NOT NULL column — add a DEFAULT"] },

  { t: "Constraints & Transactions", a: 0,
    q: "The third statement fails with `duplicate key value violates unique constraint \"t_pkey\"`. Why?",
    c: `CREATE TABLE t (id SERIAL PRIMARY KEY, v TEXT);
INSERT INTO t (id, v) VALUES (1, 'a'), (2, 'b');
INSERT INTO t (v) VALUES ('c');`,
    o: ["Explicit ids do not advance the sequence — it still hands out 1 (fix with `setval`)",
        "A SERIAL column rejects explicit values, so rows 1 and 2 were stored under new ids",
        "Column `v` is implicitly UNIQUE, and 'c' collides with an index entry",
        "A new table accepts only two rows until it has been vacuumed"] },

  { t: "Constraints & Transactions", a: 1,
    q: "Meant to give only Sales a 10% raise, run in autocommit mode. What actually happens?",
    c: `UPDATE employees
SET salary = salary * 1.10;
WHERE dept = 'Sales';`,
    o: ["Nothing changes — the syntax error on the WHERE line cancels the whole script",
        "The stray `;` ends the UPDATE — EVERY employee gets the raise, then WHERE errors",
        "Only Sales is updated — PostgreSQL ignores a semicolon before WHERE",
        "Only the first row is updated, because the UPDATE has no WHERE clause"] },

  { t: "Constraints & Transactions", a: 2,
    q: "`email` is UNIQUE, yet both inserts succeed. Why?",
    c: `CREATE TABLE members (email TEXT UNIQUE);

INSERT INTO members VALUES (NULL);
INSERT INTO members VALUES (NULL);`,
    o: ["UNIQUE is only checked at COMMIT, and each INSERT here committed separately",
        "UNIQUE constraints are not enforced on TEXT columns, only on numeric ones",
        "NULLs are not equal to each other, so UNIQUE allows many — add `NOT NULL`",
        "The second INSERT silently overwrote the first, so only one row exists"] },

  { t: "Constraints & Transactions", a: 2,
    q: "`accounts.id` is the primary key and the table starts empty. What does it contain after this script?",
    c: `BEGIN;
INSERT INTO accounts VALUES (1, 500);
INSERT INTO accounts VALUES (1, 700);  -- duplicate key
INSERT INTO accounts VALUES (2, 300);
COMMIT;`,
    o: ["Rows (1, 500) and (2, 300) — only the failing INSERT is discarded",
        "Only (1, 500) — everything after the error is skipped",
        "Nothing — the error aborts it and COMMIT acts as a ROLLBACK",
        "Only (2, 300) — the duplicate replaces the first row, then fails"] },


  /* ---------- Types & Functions (7) ---------- */
  { t: "Types & Functions", a: 3,
    q: "Why does this INSERT fail?",
    c: `CREATE TABLE users (phone VARCHAR(10));

INSERT INTO users VALUES ('+91-9876543210');`,
    o: ["VARCHAR columns cannot store the `+` or `-` characters in a value",
        "Phone numbers must be stored in an INT column, not a VARCHAR",
        "A VARCHAR column must declare a DEFAULT before it accepts inserts",
        "The value is 14 characters, longer than the declared limit of 10"] },

  { t: "Types & Functions", a: 3,
    q: "What happens?",
    c: `SELECT CAST('12.5' AS INTEGER);`,
    o: ["It returns 12 — the fractional part is truncated",
        "It returns 13 — the value is rounded",
        "It returns NULL — a failed cast is silently ignored",
        "It raises an error — the text is not a valid integer"] },

  { t: "Types & Functions", a: 2,
    q: "`roll_no` is TEXT. Results come back as 1, 10, 11, 2, 3… Fix?",
    c: `SELECT roll_no, name
FROM students
ORDER BY roll_no;`,
    o: ["`ORDER BY roll_no ASC`",
        "`ORDER BY roll_no NULLS FIRST`",
        "`ORDER BY roll_no::INT`",
        "`ORDER BY LENGTH(name)`"] },

  { t: "Types & Functions", a: 1,
    q: "Why does this fail with `function round(double precision, integer) does not exist`?",
    c: `SELECT ROUND(AVG(price)::FLOAT, 2) AS avg_price
FROM products;`,
    o: ["`AVG` cannot be nested inside `ROUND`; the average must be computed in a subquery",
        "Two-argument `ROUND` exists only for NUMERIC — cast with `::NUMERIC` instead",
        "The number of places must be passed as text, so it should be `ROUND(..., '2')`",
        "`ROUND` takes a single argument in PostgreSQL; use `TRUNC` for decimal places"] },

  { t: "Types & Functions", a: 0,
    q: "Some ads have 0 impressions, and the query fails with `division by zero`. Best fix?",
    c: `SELECT campaign,
       clicks * 100.0 / impressions AS ctr
FROM ads;`,
    o: ["Divide by `NULLIF(impressions, 0)`",
        "Divide by `COALESCE(impressions, 0)`",
        "Divide by `impressions + 0.0`",
        "Add `WHERE ctr IS NOT NULL`"] },

  { t: "Types & Functions", a: 0,
    q: "Data spans 2025 and 2026, but January sales from both years land in one row. Fix?",
    c: `SELECT EXTRACT(MONTH FROM order_date) AS m,
       SUM(amount) AS sales
FROM orders
GROUP BY m
ORDER BY m;`,
    o: ["Group by `DATE_TRUNC('month', order_date)`",
        "Group by `EXTRACT(DAY FROM order_date)`",
        "Use `SELECT DISTINCT EXTRACT(MONTH ...)`",
        "Change the last line to `ORDER BY sales`"] },

  { t: "Types & Functions", a: 3,
    q: "`order_date` is a TIMESTAMP. The output reads `2026-37-14` instead of `2026-03-14`. What is the bug?",
    c: `SELECT TO_CHAR(order_date, 'YYYY-MI-DD') AS day
FROM orders;`,
    o: ["`YYYY` must be lower case: `yyyy`",
        "`order_date` needs a `::DATE` cast first",
        "`DD` is day-of-year — use `D` instead",
        "`MI` is minutes — the month pattern is `MM`"] }
];

if (typeof module !== "undefined") { module.exports = QUESTIONS; }
