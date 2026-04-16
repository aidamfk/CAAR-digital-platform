'use strict';

const agencyModel = require('../models/agencyModel');

function normalizeAgency(row) {
  return {
    ...row,
    services: row.services
      ? row.services.split(',').map((service) => service.trim()).filter(Boolean)
      : [],
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  };
}

async function listAgencies() {
  const agencies = await agencyModel.getAllAgencies();
  return agencies.map(normalizeAgency);
}

async function filterAgencies(filters) {
  const agencies = await agencyModel.getFilteredAgencies(filters);
  return agencies.map(normalizeAgency);
}

async function findNearestAgency(lat, lng, service) {
  const agency = await agencyModel.getNearestAgency(lat, lng, service || null);
  return agency ? normalizeAgency(agency) : null;
}

async function listWilayas() {
  return agencyModel.getWilayas();
}

async function listCitiesByWilaya(wilayaId) {
  return agencyModel.getCitiesByWilaya(wilayaId);
}

async function getAgency(id) {
  const agency = await agencyModel.getAgencyById(id);
  return agency ? normalizeAgency(agency) : null;
}

module.exports = {
  listAgencies,
  filterAgencies,
  findNearestAgency,
  listWilayas,
  listCitiesByWilaya,
  getAgency,
};
