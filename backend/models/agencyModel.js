const pool = require('../db');

/**
 * Fetch all agencies that have valid coordinates.
 * CAST ensures latitude/longitude are returned as JS numbers, not strings.
 */
async function getAllAgencies() {
  const [rows] = await pool.execute(
    `SELECT
       id,
       name,
       address,
       phone,
       agency_code,
       city,
       wilaya,
       type,
       services,
       CAST(latitude  AS DOUBLE) AS latitude,
       CAST(longitude AS DOUBLE) AS longitude
     FROM agencies
     WHERE latitude IS NOT NULL
       AND longitude IS NOT NULL
     ORDER BY wilaya, city, name`
  );
  return rows;
}

module.exports = { getAllAgencies };