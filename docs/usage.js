'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('booking-script').textContent = `$base = '${location.origin}/api'
$start = (Get-Date).ToUniversalTime().AddDays(10).ToString('yyyy-MM-dd')
$end = (Get-Date).ToUniversalTime().AddDays(13).ToString('yyyy-MM-dd')
$locations = Invoke-RestMethod "$base/locations"
$cars = Invoke-RestMethod "$base/cars?start=$start&end=$end&availableOnly=true"
if (!@($cars).Count -or !@($locations).Count) { throw 'No available cars or locations' }
$trip = @{
  carId = $cars[0].id
  pickupLocationId = $locations[0].id
  dropoffLocationId = $locations[0].id
  start = $start; end = $end; driverMode = 'self'
  addons = @('insurance'); dateOfBirth = '1990-05-20'
}
$quote = Invoke-RestMethod "$base/quote" -Method Post -ContentType 'application/json' -Body ($trip | ConvertTo-Json)
$quote | ConvertTo-Json -Depth 10
if (!$quote.carAvailable) { throw 'Car no longer available' }

# Run the following only after reviewing the quote.
$booking = $trip.Clone()
$booking.customerName = 'Demo Customer'
$booking.customerEmail = 'demo@example.com'
$booking.customerPhone = '+91 90000 00000'
$booking.licenceNumber = 'DEMO-12345'
$booking.licenceCountry = 'India'
$booking.licenceExpiry = (Get-Date).ToUniversalTime().AddYears(2).ToString('yyyy-MM-dd')
$booking.paymentMethod = 'pay_at_pickup'
$booking.acceptTerms = $true
$result = Invoke-RestMethod "$base/bookings" -Method Post -ContentType 'application/json' -Body ($booking | ConvertTo-Json)
$result | ConvertTo-Json -Depth 10
$email = [uri]::EscapeDataString($booking.customerEmail)
Invoke-RestMethod "$base/bookings/lookup?ref=$($result.ref)&email=$email"

# Optional: cancel the demo booking to release the car.
# $cancel = @{ ref = $result.ref; email = $booking.customerEmail } | ConvertTo-Json
# Invoke-RestMethod "$base/bookings/cancel" -Method Post -ContentType 'application/json' -Body $cancel`;

  const status = document.getElementById('reference-status');
  try {
    const response = await fetch('/docs/api', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const content = document.getElementById('reference-content');
    content.textContent = await response.text();
    content.hidden = false;
    status.textContent = 'Reference loaded from docs/API.md.';
  } catch (error) {
    status.setAttribute('role', 'alert');
    status.textContent = `Could not load the API reference: ${error.message}. Reload this page to retry.`;
  }
});
