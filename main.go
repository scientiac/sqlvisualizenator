package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gorilla/mux"
	_ "github.com/mattn/go-sqlite3"
)

var db *sql.DB

type Column struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	PK         bool   `json:"pk"`
	FK         bool   `json:"fk"`
	References string `json:"references,omitempty"`
}

type Table struct {
	Name    string   `json:"name"`
	Columns []Column `json:"columns"`
}

type SchemaResponse struct {
	Tables []Table `json:"tables"`
}

func main() {
	// Initial database setup
	initDB()

	// Set up the web server
	r := mux.NewRouter()
	r.HandleFunc("/query", handleQuery).Methods("POST")
	r.HandleFunc("/reset", handleReset).Methods("POST")
	r.HandleFunc("/schema", handleSchema).Methods("GET")
	r.PathPrefix("/").Handler(http.FileServer(http.Dir("./static/")))

	log.Println("Server running at http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}

func initDB() {
	var err error
	db, err = sql.Open("sqlite3", "./mydb.db")
	if err != nil {
		log.Fatal("Cannot open database: ", err)
	}
}

func handleQuery(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var query struct {
		SQL string `json:"sql"`
	}
	if err := json.NewDecoder(r.Body).Decode(&query); err != nil {
		sendError(w, "Bad request: invalid JSON", http.StatusBadRequest)
		return
	}

	sqlQuery := strings.TrimSpace(query.SQL)
	isSelect := strings.HasPrefix(strings.ToUpper(sqlQuery), "SELECT")

	if isSelect {
		rows, err := db.Query(sqlQuery)
		if err != nil {
			sendError(w, "Query error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		columns, err := rows.Columns()
		if err != nil {
			sendError(w, "Error getting columns: "+err.Error(), http.StatusInternalServerError)
			return
		}

		results := []map[string]any{}
		for rows.Next() {
			values := make([]any, len(columns))
			pointers := make([]any, len(columns))
			for i := range values {
				pointers[i] = &values[i]
			}

			if err := rows.Scan(pointers...); err != nil {
				sendError(w, "Scan error: "+err.Error(), http.StatusInternalServerError)
				return
			}

			row := make(map[string]any)
			for i, col := range columns {
				val := values[i]
				if b, ok := val.([]byte); ok {
					row[col] = string(b)
				} else {
					row[col] = val
				}
			}
			results = append(results, row)
		}
		json.NewEncoder(w).Encode(results)
	} else {
		result, err := db.Exec(sqlQuery)
		if err != nil {
			sendError(w, "Exec error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		rowsAffected, _ := result.RowsAffected()
		response := map[string]any{
			"message":      "Query executed successfully",
			"rowsAffected": rowsAffected,
		}
		json.NewEncoder(w).Encode(response)
	}
}

func handleSchema(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Get list of all tables
	rows, err := db.Query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
	if err != nil {
		sendError(w, "Error querying tables: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tables []Table
	for rows.Next() {
		var tableName string
		if err := rows.Scan(&tableName); err != nil {
			sendError(w, "Error scanning table name: "+err.Error(), http.StatusInternalServerError)
			return
		}

		tableObj := Table{Name: tableName}

		// Get column information for this table
		pragmaRows, err := db.Query("PRAGMA table_info(" + tableName + ")")
		if err != nil {
			sendError(w, "Error querying table info: "+err.Error(), http.StatusInternalServerError)
			return
		}

		for pragmaRows.Next() {
			var cid int
			var name, dataType string
			var notNull, isPK int
			var defaultValue interface{}

			if err := pragmaRows.Scan(&cid, &name, &dataType, &notNull, &defaultValue, &isPK); err != nil {
				pragmaRows.Close()
				sendError(w, "Error scanning column info: "+err.Error(), http.StatusInternalServerError)
				return
			}

			column := Column{
				Name: name,
				Type: dataType,
				PK:   isPK > 0,
			}

			tableObj.Columns = append(tableObj.Columns, column)
		}
		pragmaRows.Close()

		// Get foreign key information
		fkRows, err := db.Query("PRAGMA foreign_key_list(" + tableName + ")")
		if err != nil {
			// SQLite might not have foreign keys enabled, so we'll just continue
			log.Printf("Error querying foreign keys for %s: %v", tableName, err)
		} else {
			for fkRows.Next() {
				var id, seq int
				var targetTable, from, to string
				var onUpdate, onDelete, match string

				if err := fkRows.Scan(&id, &seq, &targetTable, &from, &to, &onUpdate, &onDelete, &match); err != nil {
					fkRows.Close()
					sendError(w, "Error scanning foreign key info: "+err.Error(), http.StatusInternalServerError)
					return
				}

				// Update the column with foreign key info
				for i, col := range tableObj.Columns {
					if col.Name == from {
						tableObj.Columns[i].FK = true
						tableObj.Columns[i].References = targetTable + "." + to
						break
					}
				}
			}
			fkRows.Close()
		}

		tables = append(tables, tableObj)
	}

	response := SchemaResponse{Tables: tables}
	json.NewEncoder(w).Encode(response)
}

func handleReset(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Close the current database connection
	if err := db.Close(); err != nil {
		sendError(w, "Failed to close database: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Delete the database file
	if err := os.Remove("./mydb.db"); err != nil && !os.IsNotExist(err) {
		sendError(w, "Failed to delete database: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Reinitialize the database
	initDB()

	// Send success response
	response := map[string]string{
		"message": "Database reset successfully",
	}
	json.NewEncoder(w).Encode(response)
}

func sendError(w http.ResponseWriter, message string, statusCode int) {
	w.WriteHeader(statusCode)
	errorResponse := map[string]string{
		"error": message,
	}
	json.NewEncoder(w).Encode(errorResponse)
}
