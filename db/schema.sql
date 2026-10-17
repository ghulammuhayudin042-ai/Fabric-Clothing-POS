-- Money = integer paisa (PKR x100). Quantity/length = integer milli-units (x1000). No floats stored.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS units(code TEXT PRIMARY KEY,name TEXT NOT NULL,decimals INTEGER NOT NULL DEFAULT 0 CHECK(decimals BETWEEN 0 AND 3));
CREATE TABLE IF NOT EXISTS roles(name TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS permissions(role TEXT REFERENCES roles(name),perm TEXT,PRIMARY KEY(role,perm));
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,pass_hash TEXT NOT NULL,role TEXT NOT NULL REFERENCES roles(name),active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS suppliers(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT,address TEXT,opening_balance INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT,address TEXT,opening_balance INTEGER NOT NULL DEFAULT 0,credit_limit INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY,sku TEXT UNIQUE NOT NULL,barcode TEXT UNIQUE,name TEXT NOT NULL,
 category_id INTEGER REFERENCES categories(id),parent_id INTEGER REFERENCES products(id),brand TEXT,fabric TEXT,color TEXT,design TEXT,size TEXT,
 unit TEXT NOT NULL DEFAULT 'pc' REFERENCES units(code),cost_price INTEGER NOT NULL DEFAULT 0 CHECK(cost_price>=0),
 sale_price INTEGER NOT NULL DEFAULT 0 CHECK(sale_price>=0),wholesale_price INTEGER,
 reorder_level INTEGER NOT NULL DEFAULT 0,stock INTEGER NOT NULL DEFAULT 0,supplier_id INTEGER REFERENCES suppliers(id),
 is_suit INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,is_demo INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_prod_name ON products(name);
CREATE TABLE IF NOT EXISTS suit_components(suit_id INTEGER REFERENCES products(id),component_id INTEGER REFERENCES products(id),qty INTEGER NOT NULL CHECK(qty>0),PRIMARY KEY(suit_id,component_id));
CREATE TABLE IF NOT EXISTS fabric_rolls(id INTEGER PRIMARY KEY,roll_code TEXT UNIQUE NOT NULL,product_id INTEGER NOT NULL REFERENCES products(id),
 initial_length INTEGER NOT NULL,remaining_length INTEGER NOT NULL,cost_per_unit INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open');
CREATE TABLE IF NOT EXISTS invoice_sequences(prefix TEXT PRIMARY KEY,last_no INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sales(id INTEGER PRIMARY KEY,invoice_no TEXT UNIQUE NOT NULL,ts TEXT NOT NULL DEFAULT(datetime('now','localtime')),
 cashier_id INTEGER REFERENCES users(id),customer_id INTEGER REFERENCES customers(id),subtotal INTEGER NOT NULL,discount INTEGER NOT NULL DEFAULT 0,
 tax INTEGER NOT NULL DEFAULT 0,total INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'completed',client_token TEXT UNIQUE);
CREATE INDEX IF NOT EXISTS ix_sales_ts ON sales(ts);
CREATE TABLE IF NOT EXISTS sale_items(id INTEGER PRIMARY KEY,sale_id INTEGER NOT NULL REFERENCES sales(id),product_id INTEGER NOT NULL REFERENCES products(id),
 roll_id INTEGER REFERENCES fabric_rolls(id),unit TEXT NOT NULL,qty INTEGER NOT NULL CHECK(qty>0),unit_price INTEGER NOT NULL,discount INTEGER NOT NULL DEFAULT 0,
 line_total INTEGER NOT NULL,cost_snapshot INTEGER NOT NULL,returned_qty INTEGER NOT NULL DEFAULT 0 CHECK(returned_qty<=qty));
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY,sale_id INTEGER REFERENCES sales(id),customer_id INTEGER REFERENCES customers(id),
 method TEXT NOT NULL,amount INTEGER NOT NULL,reference TEXT,kind TEXT NOT NULL DEFAULT 'sale',ts TEXT NOT NULL DEFAULT(datetime('now','localtime')));
CREATE INDEX IF NOT EXISTS ix_pay_sale ON payments(sale_id);
CREATE TABLE IF NOT EXISTS returns(id INTEGER PRIMARY KEY,sale_id INTEGER NOT NULL REFERENCES sales(id),user_id INTEGER,reason TEXT,refund_amount INTEGER NOT NULL,
 refund_mode TEXT NOT NULL DEFAULT 'cash',restock INTEGER NOT NULL DEFAULT 1,ts TEXT NOT NULL DEFAULT(datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS return_items(id INTEGER PRIMARY KEY,return_id INTEGER REFERENCES returns(id),sale_item_id INTEGER REFERENCES sale_items(id),qty INTEGER NOT NULL,amount INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS stock_movements(id INTEGER PRIMARY KEY,product_id INTEGER NOT NULL REFERENCES products(id),roll_id INTEGER REFERENCES fabric_rolls(id),
 qty INTEGER NOT NULL,type TEXT NOT NULL CHECK(type IN('purchase','sale','return','adjustment','damage','transfer','opening')),
 source_type TEXT,source_id INTEGER,user_id INTEGER,note TEXT,ts TEXT NOT NULL DEFAULT(datetime('now','localtime')));
CREATE INDEX IF NOT EXISTS ix_sm_prod ON stock_movements(product_id,ts);
CREATE TABLE IF NOT EXISTS purchases(id INTEGER PRIMARY KEY,supplier_id INTEGER REFERENCES suppliers(id),ref_no TEXT,total INTEGER NOT NULL,paid INTEGER NOT NULL DEFAULT 0,ts TEXT NOT NULL DEFAULT(datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS purchase_items(id INTEGER PRIMARY KEY,purchase_id INTEGER REFERENCES purchases(id),product_id INTEGER REFERENCES products(id),roll_id INTEGER REFERENCES fabric_rolls(id),qty INTEGER NOT NULL CHECK(qty>0),unit_cost INTEGER NOT NULL,returned_qty INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS purchase_returns(id INTEGER PRIMARY KEY,purchase_id INTEGER REFERENCES purchases(id),supplier_id INTEGER,amount INTEGER NOT NULL,user_id INTEGER,ts TEXT NOT NULL DEFAULT(datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS supplier_payments(id INTEGER PRIMARY KEY,supplier_id INTEGER REFERENCES suppliers(id),amount INTEGER NOT NULL,reference TEXT,ts TEXT NOT NULL DEFAULT(datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS held_sales(id INTEGER PRIMARY KEY,user_id INTEGER,label TEXT,payload TEXT NOT NULL,ts TEXT NOT NULL DEFAULT(datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS expenses(id INTEGER PRIMARY KEY,title TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>=0),ts TEXT NOT NULL DEFAULT(datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS shifts(id INTEGER PRIMARY KEY,user_id INTEGER,opened_at TEXT DEFAULT(datetime('now','localtime')),opening_cash INTEGER NOT NULL,closed_at TEXT,closing_cash INTEGER);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY,user_id INTEGER,action TEXT NOT NULL,record_type TEXT,record_id INTEGER,detail TEXT,ts TEXT NOT NULL DEFAULT(datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
CREATE TABLE IF NOT EXISTS backups(id INTEGER PRIMARY KEY,path TEXT,ts TEXT DEFAULT(datetime('now','localtime')));
INSERT OR IGNORE INTO units VALUES('m','Meter',3),('yd','Yard',3),('pc','Piece',0),('suit','Suit/Set',0),('roll','Roll/Bundle',0),('kg','Kilogram',3);
INSERT OR IGNORE INTO roles VALUES('admin'),('manager'),('cashier');
INSERT OR IGNORE INTO settings VALUES('currency','PKR'),('tax_enabled','0'),('tax_rate_bp','0'),('allow_negative_stock','0'),('invoice_prefix','INV'),('costing','weighted_average');
