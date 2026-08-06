package config

import (
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"time"

	"zord-edge/db"
	"zord-edge/logger"

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
		os.Getenv("DB_USER"),     // Database username
		os.Getenv("DB_PASSWORD"), // Database password
		os.Getenv("DB_HOST"),     // Database host (e.g., localhost, postgres container)
		os.Getenv("DB_PORT"),     // Database port (default: 5432)
		os.Getenv("DB_NAME"),     // Database name
		os.Getenv("DB_SSLMODE"),  // SSL mode (disable for local development)
	)
	db.DB, err = sql.Open("postgres", dsn)
	if err != nil {
		logger.Log.Error("database configuration failed",
			slog.String("error", err.Error()))
		os.Exit(1)
	}

	maxRetries := 10
	retryDelay := 1 * time.Second

	for i := 0; i < maxRetries; i++ {
		err = db.DB.Ping()
		if err == nil {
			logger.Log.Info("database connection established successfully")
			break
		}

		if i < maxRetries-1 {
			logger.Log.Warn("database ping failed, retrying",
				slog.Int("attempt", i+1),
				slog.Int("max_retries", maxRetries),
				slog.String("error", err.Error()),
				slog.Duration("retry_in", retryDelay))
			time.Sleep(retryDelay)
			retryDelay *= 2 // Exponential backoff
		} else {
			logger.Log.Error("database ping failed after all attempts",
				slog.Int("max_retries", maxRetries),
				slog.String("error", err.Error()))
			os.Exit(1)
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
