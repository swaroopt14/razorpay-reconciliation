package testutil

import (
	"database/sql"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"
)

// StartTestDB returns a mocked SQL database connection.
func StartTestDB(t *testing.T) (*sql.DB, sqlmock.Sqlmock) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)

	t.Cleanup(func() {
		db.Close()
	})

	return db, mock
}
