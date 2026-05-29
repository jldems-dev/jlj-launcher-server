require("dotenv").config({ quiet: true });

const env = {
  port: process.env.PORT || 3002,
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET,
  pcSecret: process.env.PC_SECRET,
  allowedIps: (
    process.env.ALLOWED_IPS || "127.0.0.1,::1,192.168.1.,10.0.0.,192.168.2."
  )
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean),
  corsOrigin:
    process.env.NODE_ENV === "production"
      ? process.env.API_BASE_URL_DEV
      : process.env.API_BASE_URL_PROD,
};

module.exports = { env };
