# Subscription System Implementation

## Overview

This document describes the subscription system implementation for Resumate, including automatic renewals and subscription expiration handling.

## Subscription Features

- Support for multiple plan types: free, premium_monthly, premium_yearly
- Separate APIs for managing subscriptions: upgrade, cancel renewal, enable renewal
- Automatic renewal of subscriptions through scheduled jobs
- Graceful handling of expired subscriptions

## Subscription User Flow

1. **Upgrade to Premium**: User selects a premium plan and makes a payment

   - API: `POST /api/v1/users/subscription/upgrade`
   - Required fields: plan, paymentId, paymentProvider
   - Auto-renewal is enabled by default

2. **Cancel Auto-Renewal**: User cancels auto-renewal but keeps premium until expiry

   - API: `POST /api/v1/users/subscription/cancel-renewal`
   - Premium benefits remain until the subscription expiry date
   - After expiry, the user is automatically downgraded to free

3. **Enable Auto-Renewal**: User re-enables auto-renewal for their subscription

   - API: `POST /api/v1/users/subscription/enable-renewal`
   - At the end of the subscription period, the system will automatically charge for renewal

4. **Check Subscription Status**: Get current subscription details
   - API: `GET /api/v1/users/subscription/status`
   - Returns subscription details, tier, and permissions

## Automatic Renewal Process

1. A daily cron job runs at 1:00 AM to check for subscriptions to process
2. For users with auto-renewal enabled whose subscription expires within 24 hours:

   - System attempts to process payment with the stored payment method
   - If successful, extends the subscription period based on the plan type
   - If failed, marks the subscription as expired

3. For users whose subscriptions have already expired:
   - If auto-renewal is disabled, downgrades to free plan
   - If auto-renewal is enabled but payment failed, marks as expired

## User Schema Changes

- Added `autoRenew` boolean field to the subscription object
- This controls whether the subscription should automatically renew

## Cron Jobs

- `process-expired-subscriptions`: Runs daily at 1:00 AM to check and process expiring subscriptions
- `process-auto-renewals`: Runs daily at 2:00 AM (currently redundant, handled by the expired subscriptions job)

## Payment Processing Integration

The subscription renewal process is designed to integrate with payment processors:

- Currently supports: Stripe and PayPal (conceptually)
- When a subscription is due for renewal, the stored payment method is charged
- Successful payment extends the subscription period
- Failed payment marks the subscription as expired

## Technical Implementation

The implementation includes:

- New controllers for subscription management
- Validation middleware for each subscription operation
- Subscription service methods for business logic
- Cron service for scheduled tasks
- Graceful shutdown handling

## Future Enhancements

1. Implement webhook handlers for payment processor events
2. Add retry mechanism for failed payments
3. Implement notification system for subscription events (renewal, expiry, etc.)
4. Add subscription analytics and reporting
