'use strict';

const agencyService = require('../services/agencyService');

async function list(req, res) {
  try {
    const agencies = await agencyService.listAgencies();
    return res.status(200).json(agencies);
  } catch (err) {
    console.error('[Agencies] list error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function filter(req, res) {
  try {
    const { wilaya_id, city_id, type, service } = req.query;
    const agencies = await agencyService.filterAgencies({
      wilaya_id,
      city_id,
      type,
      service,
    });
    return res.status(200).json(agencies);
  } catch (err) {
    console.error('[Agencies] filter error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function nearest(req, res) {
  const { lat, lng, service } = req.query;
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);

  if (isNaN(latNum) || isNaN(lngNum)) {
    return res.status(400).json({ error: 'lat and lng must be valid numbers' });
  }

  if (latNum < 19 || latNum > 38 || lngNum < -9 || lngNum > 12) {
    return res.status(400).json({ error: 'Coordinates outside Algeria bounds' });
  }

  try {
    const agency = await agencyService.findNearestAgency(latNum, lngNum, service);
    if (!agency) {
      return res.status(404).json({ error: 'No agency found near those coordinates' });
    }
    return res.status(200).json(agency);
  } catch (err) {
    console.error('[Agencies] nearest error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function listWilayas(req, res) {
  try {
    const wilayas = await agencyService.listWilayas();
    return res.status(200).json(wilayas);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function listCities(req, res) {
  const wilayaId = parseInt(req.params.wilayaId, 10);
  if (isNaN(wilayaId) || wilayaId < 1) {
    return res.status(400).json({ error: 'wilayaId must be a positive integer' });
  }

  try {
    const cities = await agencyService.listCitiesByWilaya(wilayaId);
    return res.status(200).json(cities);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getOne(req, res) {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 1) {
    return res.status(400).json({ error: 'id must be a positive integer' });
  }

  try {
    const agency = await agencyService.getAgency(id);
    if (!agency) {
      return res.status(404).json({ error: 'Agency not found' });
    }
    return res.status(200).json(agency);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { list, filter, nearest, listWilayas, listCities, getOne };
