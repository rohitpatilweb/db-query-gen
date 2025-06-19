from flask import Flask, jsonify, request
from flask_cors import CORS
import psycopg2
import requests
from langchain_community.utilities import SQLDatabase
from langchain.chat_models import init_chat_model
from langchain_core.prompts import ChatPromptTemplate
from typing_extensions import Annotated, TypedDict
from sqlalchemy import create_engine
import os

# Flask app setup
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Load sensitive credentials from environment variables
DB_NAME = os.getenv("DB_NAME", "neondb")
DB_USER = os.getenv("DB_USER", "neondb_owner")
DB_PASSWORD = os.getenv("DB_PASSWORD", "npg_4hNJf3aEqbpS")
DB_HOST = os.getenv("DB_HOST", "ep-rough-star-a5u6dls1-pooler.us-east-2.aws.neon.tech")
DB_SSLMODE = os.getenv("DB_SSLMODE", "require")

# # Initialize database connection
# conn = psycopg2.connect(
#     dbname=DB_NAME,
#     user=DB_USER,
#     password=DB_PASSWORD,
#     host=DB_HOST,
#     sslmode=DB_SSLMODE,
# )

# Initialize SQLAlchemy engine
DATABASE_URL = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}?sslmode={DB_SSLMODE}"
engine = create_engine(DATABASE_URL)
db = SQLDatabase(engine)

# Initialize the chat model
llm = init_chat_model("gemini-2.0-flash", model_provider="google_genai", api_key="AIzaSyBvMFnhT70Rd-2SKVmgi1dPj9a3XWBlpu8")

system_message = """
Given an input question, create a syntactically correct {dialect} SQL query
to answer the question using only the provided schema.

Instructions:
- Use single quotes ('...') for all string literals. Never use double quotes for string values.
- Unless the question specifies a different number, limit the output to at most {top_k} results using LIMIT.
- Order results by a meaningful column (e.g., price, name, date) if relevant to the question.
- Do not SELECT * — only include the most relevant columns in your SELECT clause.
- Use aliases (e.g., AS) where helpful for clarity, but only when needed.
- Use only columns and tables explicitly defined in the schema: {table_info}.
- Do not reference columns or tables that do not exist.
- Ensure that any join uses valid foreign key relationships defined in the schema.
- If the question refers to a known value (e.g., a product category like Beverages), enclose it in single quotes.

Example (if the question asks for beverage products):
SELECT p.product_name, p.unit_price, s.company_name
FROM products AS p
JOIN categories AS c ON p.category_id = c.category_id
JOIN suppliers AS s ON p.supplier_id = s.supplier_id
WHERE c.category_name = 'Beverages'
LIMIT 10;
"""


user_prompt = "Question: {input}"

query_prompt_template = ChatPromptTemplate(
    [("system", system_message), ("user", user_prompt)]
)

class QueryOutput(TypedDict):
    """Generated SQL query."""
    query: Annotated[str, ..., "Syntactically valid SQL query."]

@app.route('/schema')
def get_schema():
    """Fetch the database schema."""
    conn = psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        sslmode=DB_SSLMODE,
    )
    cur = conn.cursor()

    cur.execute("""
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position;
    """)
    columns = cur.fetchall()

    cur.execute("""
        SELECT
            tc.table_name AS source_table,
            kcu.column_name AS source_column,
            ccu.table_name AS target_table,
            ccu.column_name AS target_column
        FROM
            information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
    """)
    fkeys = cur.fetchall()

    cur.close()
    conn.close()

    tables = {}
    for table_name, column_name, data_type in columns:
        if table_name not in tables:
            tables[table_name] = []
        tables[table_name].append({'name': column_name, 'type': data_type})

    foreign_keys = []
    for src_table, src_col, tgt_table, tgt_col in fkeys:
        foreign_keys.append({
            'source_table': src_table,
            'source_column': src_col,
            'target_table': tgt_table,
            'target_column': tgt_col,
        })

    return jsonify({'tables': tables, 'foreign_keys': foreign_keys})


@app.route('/generate-sql', methods=['POST'])
def generate_sql():
    """Generate SQL query based on user input."""
    data = request.get_json()
    user_query = data.get('query', '')

    if not user_query:
        return jsonify({'error': 'Query is required'}), 400

    schema_info = get_schema().get_json()["tables"]
    prompt = query_prompt_template.invoke(
        {
            "dialect": "PostgreSQL",
            "top_k": 10,
            "table_info": schema_info,
            "input": user_query,
        }
    )
    structured_llm = llm.with_structured_output(QueryOutput)
    result = structured_llm.invoke(prompt)
    query_result = execute_sql(result['query'])
    columns = get_columns_via_cursor(result['query'])
    query_result['columns'] = columns

    return jsonify({'sql':result['query'], 'query_result' : query_result})

def get_columns_via_cursor(query: str):
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            sslmode=DB_SSLMODE,
        )
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM ({query}) AS sub LIMIT 0")
        columns = [desc[0] for desc in cur.description]
        print("Columns extracted:", columns)
        cur.close()
        conn.close()
        return columns
    except Exception as e:
        print("Error:", e)
        return []

@app.route('/execute-query', methods=['POST'])
def execute_sql():
    data = request.json
    query = data.get('query', '')
    if not query:
        return jsonify({'error': 'Query is required'}), 400
    if not query.lower().startswith("select"):
        return jsonify({'error': 'Only SELECT queries are allowed'}), 400

    query_result = execute_sql(query)
    columns = get_columns_via_cursor(query)
    query_result['columns'] = columns

    return jsonify({'query_result' : query_result})

def execute_sql(query: str):
    """Execute the generated SQL query."""
    print("Query:", query)
    try:
        conn = psycopg2.connect(
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            host=DB_HOST,
            sslmode=DB_SSLMODE,
        )
        cur = conn.cursor()
        cur.execute(query)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        print("Rows:", rows)
        return {'results': rows}
    except psycopg2.Error as e:
        print("Error executing query:", e)
        return {'error': str(e)}


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 2000))
    app.run(host="0.0.0.0", port=port)
