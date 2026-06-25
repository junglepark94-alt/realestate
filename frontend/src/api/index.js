import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const fetchApartments = () => api.get('/apartments').then(r => r.data);

export const fetchTransactions = (aptId, months = 12) =>
  api.get(`/transactions/${aptId}`, { params: { months } }).then(r => r.data);

export const fetchListings = (aptId) =>
  api.get(`/listings/${aptId}`, { timeout: 30000 }).then(r => r.data);
