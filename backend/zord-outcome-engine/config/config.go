package config

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	"zord-outcome-engine/db"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

type Config struct {
	VaultKey string
}

func InitDB() {
	var err error
	_ = godotenv.Load()
	dsn := fmt.Sprintf("user=%s password=%s host=%s port=%s dbname=%s sslmode=%s",
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_NAME"),
		os.Getenv("DB_SSLMODE"),
	)
	db.DB, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("Database configuration failed: %v", err)
	}

	maxRetries := 10
	retryDelay := 1 * time.Second

	for i := 0; i < maxRetries; i++ {
		err = db.DB.Ping()
		if err == nil {
			log.Println("Database connection established successfully")
			break
		}

		if i < maxRetries-1 {
			log.Printf("Database Ping Error (attempt %d/%d): %v - retrying in %v", i+1, maxRetries, err, retryDelay)
			time.Sleep(retryDelay)
			retryDelay *= 2 // Exponential backoff
		} else {
			log.Fatalf("Database Ping Error after %d attempts: %v", maxRetries, err)
		}
	}
	db.DB.SetMaxOpenConns(50)
	db.DB.SetMaxIdleConns(20)
	db.DB.SetConnMaxLifetime(10 * time.Minute)
	db.DB.SetConnMaxIdleTime(5 * time.Minute)
}

func LoadConfig() *Config {
	return &Config{
		VaultKey: os.Getenv("ZORD_VAULT_KEY"),
	}
}
