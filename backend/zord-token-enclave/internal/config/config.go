package config

import (
	"encoding/base64"
	"fmt"
	"log"
	"os"
)

type Config struct {
	DBURL       string
	KMSKeyID    string // AWS KMS CMK ID/ARN used to wrap tenant DEKs (TOK-03)
	TokenSecret []byte // ✅ decoded HMAC secret for deterministic tokens
}

func Load() *Config {
	host := os.Getenv("DB_HOST")
	port := os.Getenv("DB_PORT")
	user := os.Getenv("DB_USER")
	pass := os.Getenv("DB_PASSWORD")
	name := os.Getenv("DB_NAME")
	ssl := os.Getenv("DB_SSLMODE")

	if port == "" {
		port = "5432"
	}
	if ssl == "" {
		ssl = "disable"
	}

	if host == "" || user == "" || name == "" {
		log.Fatal("❌ DB config missing: DB_HOST / DB_USER / DB_NAME must be set")
	}

	dbURL := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		user, pass, host, port, name, ssl,
	)

	// 🔐 KMS_KEY_ID: the AWS KMS CMK ID/ARN this service uses to wrap/unwrap
	// tenant DEKs (TOK-03). Not a secret -- an ARN alone grants no access --
	// so it's a plain env var, not base64/not a k8s Secret.
	kmsKeyID := os.Getenv("KMS_KEY_ID")
	if kmsKeyID == "" {
		log.Fatal("❌ KMS_KEY_ID not set")
	}

	// 🔐 Load and decode TOKEN_SECRET
	tokenSecretB64 := os.Getenv("TOKEN_SECRET")
	if tokenSecretB64 == "" {
		log.Fatal("❌ TOKEN_SECRET not set")
	}

	tokenSecret, err := base64.StdEncoding.DecodeString(tokenSecretB64)
	if err != nil {
		log.Fatal("❌ TOKEN_SECRET is not valid base64:", err)
	}

	return &Config{
		DBURL:       dbURL,
		KMSKeyID:    kmsKeyID,
		TokenSecret: tokenSecret,
	}
}
