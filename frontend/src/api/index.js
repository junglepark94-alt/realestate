import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const fetchApartments = () => api.get('/apartments').then(r => r.data);

export const fetchTransactions = (aptId, months = 12) =>
  api.get(`/transactions/${aptId}`, { params: { months } }).then(r => r.data);

export const fetchFavorites = () => api.get('/favorites').then(r => r.data.favorites);

export const setFavorite = (aptId, on) =>
  api.request({ url: `/favorites/${aptId}`, method: on ? 'put' : 'delete' })
    .then(r => r.data.favorites);

export const fetchListings = (aptId) =>
  api.get(`/listings/${aptId}`, { timeout: 30000 }).then(r => r.data);
