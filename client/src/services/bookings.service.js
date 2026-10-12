import { api } from './apiClient.js';
import { toQuery } from './users.service.js';

export function listBookings(params = {}) {
  return api.get(`/bookings${toQuery(params)}`);
}

export function getBooking(id) {
  return api.get(`/bookings/${id}`).then((response) => response.data.booking);
}

export function createBooking(payload) {
  return api.post('/bookings', payload).then((response) => response.data.booking);
}

export function updateBooking(id, changes) {
  return api.patch(`/bookings/${id}`, changes).then((response) => response.data.booking);
}

export function cancelBooking(id, reason) {
  return api.post(`/bookings/${id}/cancel`, { reason }).then((response) => response.data.booking);
}

// --- Party -----------------------------------------------------------------

export function addBookingTraveller(bookingId, { travellerId, isLead = false, notes }) {
  return api
    .post(`/bookings/${bookingId}/travellers`, { travellerId, isLead, notes })
    .then((response) => response.data.booking);
}

export function removeBookingTraveller(bookingId, travellerId) {
  return api
    .delete(`/bookings/${bookingId}/travellers/${travellerId}`)
    .then((response) => response.data.booking);
}

// --- Itinerary -------------------------------------------------------------

export function listSegments(bookingId) {
  return api.get(`/bookings/${bookingId}/itinerary`);
}

export function addSegment(bookingId, payload) {
  return api.post(`/bookings/${bookingId}/itinerary`, payload).then((response) => response.data.segment);
}

export function updateSegment(bookingId, segmentId, changes) {
  return api
    .patch(`/bookings/${bookingId}/itinerary/${segmentId}`, changes)
    .then((response) => response.data.segment);
}

export function deleteSegment(bookingId, segmentId) {
  return api.delete(`/bookings/${bookingId}/itinerary/${segmentId}`);
}

export function reorderSegments(bookingId, segmentIds) {
  return api.post(`/bookings/${bookingId}/itinerary/reorder`, { segmentIds });
}

// --- Readiness -------------------------------------------------------------

export function getReadiness(bookingId) {
  return api.get(`/bookings/${bookingId}/readiness`);
}
