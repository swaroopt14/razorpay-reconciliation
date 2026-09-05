package config

import (
	"database/sql"
	_ "embed"
	"fmt"
	"log"
	"os"
	"time"

	"zord-intent-engine/db"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

// GlobalProfilesJSON is the content of global_profiles.json embedded at compile time.
// It contains source-system detection signatures and default column maps for known
// ERP/accounting sources (TALLY, SAP, ERP, QUICKBOOKS, ZORD_RAW).
//
//go:embed global_profiles.json
var GlobalProfilesJSON []byte

type Config struct {
	VaultKey string
}

func InitDB() {
	var err error
	_ = godotenv.Load()
	dsn := fmt.Sprintf("user=%s password=%s host=%s port=%s dbname=%s sslmode=%s",
		os.Getenv("DB_USER"),     // Database username
		os.Getenv("DB_PASSWORD"), // Database password
		os.Getenv("DB_HOST"),     // Database host (e.g., localhost, postgres container)
		os.Getenv("DB_PORT"),     // Database port (default: 5432)
		os.Getenv("DB_NAME"),     // Database name
		os.Getenv("DB_SSLMODE"),  // SSL mode (disable for local development)
	)
	db.DB, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("Database configuration failed: %v", err)
	}
	err = db.DB.Ping()
	if err != nil {
		log.Fatalf("Database Ping Error %v", err)
	}
	db.DB.SetMaxOpenConns(50)
	db.DB.SetMaxIdleConns(20)
	db.DB.SetConnMaxLifetime(10 * time.Minute)
	db.DB.SetConnMaxIdleTime(5 * time.Minute)

}

func GetWorkerPoolSize() int {
	size := 512
	if val := os.Getenv("WORKER_POOL_SIZE"); val != "" {
		fmt.Sscanf(val, "%d", &size)
	}
	return size
}
func LoadConfig() *Config {
	return &Config{
		VaultKey: os.Getenv("ZORD_VAULT_KEY"),
	}
}
