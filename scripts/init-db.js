const { initializeDatabase, dbPath } = require("../src/db");

initializeDatabase()
  .then(() => {
    console.log(`Database initialized: ${dbPath}`);
  })
  .catch((error) => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });
