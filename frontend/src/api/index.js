import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const fetchApartments = () => api.get('/apartments').then(r => r.data);

export const fetchTransactions = (aptId, months = 12) =>
  api.get(`/transactions/${aptId}`, { params: { months } }).then(r => r.data);

export const fetchListings = (aptId) =>
  api.get(`/listings/${aptId}`).then(r => r.data);

export const fetchPriceTrend = (aptId, years = 5) =>
  api.get(`/price-trend/${aptId}`, { params: { years } }).then(r => r.data);
