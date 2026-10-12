# TrailAsia database schema (23 tables)

MySQL 8 types. Every table also has `created_at` and `updated_at` (DATETIME, required), listed once here instead of 23 times. `Req.` = required (NOT NULL). Foreign keys show the parent table and what happens to the child row when the parent is deleted.

Source: the 42 migrations, replayed in the project reference document (5 Oct 2026). Check names against your own migrations before you submit.

## Tables

| # | Table | Purpose |
|---|---|---|
| 1 | `users` | Staff account with one of four roles |
| 2 | `refresh_tokens` | One signed-in session for a staff member, traveller or operator; exactly one of user_id, traveller_id, operator_id is filled |
| 3 | `destinations` | Country or region sold, with travel-guide and marketing content |
| 4 | `document_requirements` | A document a destination requires of every traveller |
| 5 | `travellers` | A person who travels; also holds their portal sign-in columns |
| 6 | `traveller_documents` | A document a traveller holds, with status and optional uploaded file |
| 7 | `bookings` | One trip |
| 8 | `booking_travellers` | Puts a traveller on a booking (junction table) |
| 9 | `itinerary_segments` | One ordered leg of a booking in one destination |
| 10 | `location_consents` | A traveller’s consent to share location on one booking |
| 11 | `location_pings` | One recorded position; deleted 30 days after the trip ends |
| 12 | `sos_alerts` | Emergency alert raised by a traveller on a booking; kept indefinitely |
| 13 | `sos_alert_events` | One entry in an alert’s history; append-only; never holds coordinates |
| 14 | `tasks` | A piece of work on a booking, manual or generated from a document gap |
| 15 | `task_events` | One entry in a task’s history; append-only |
| 16 | `notifications` | One in-app message to one staff member, traveller or operator; exactly one of user_id, traveller_id, operator_id is filled |
| 17 | `operators` | A local supplier in one destination, with portal sign-in columns |
| 18 | `operator_confirmations` | A request to an operator for a service on a booking, and the answer |
| 19 | `payment_schedules` | An instalment: an amount due on a booking by a date (no paid column; paid is computed from payments) |
| 20 | `payments` | One movement of money on a booking, in or out; amount_in_base = amount x exchange_rate, fixed at entry |
| 21 | `testimonials` | A published traveller quote, optionally about one destination |
| 22 | `contact_messages` | General message from the public site; no links to other tables |
| 23 | `email_logs` | One attempt to send an email; no links to other tables |

## `users`

Staff account with one of four roles.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `first_name` | VARCHAR(100) | Y |  |  |  |  |  |
| `last_name` | VARCHAR(100) | Y |  |  |  |  |  |
| `email` | VARCHAR(255) | Y | UQ |  |  |  |  |
| `password_hash` | VARCHAR(255) | Y |  |  |  |  | bcrypt |
| `role` | ENUM('consultant','coordinator','finance','admin') | Y |  |  |  | consultant |  |
| `is_active` | BOOLEAN | Y |  |  |  | true |  |
| `last_login_at` | DATETIME | N |  |  |  |  |  |
| `failed_login_attempts` | INTEGER UNSIGNED | Y |  |  |  | 0 | lock after 5 |
| `locked_until` | DATETIME | N |  |  |  |  | 15 minute lock |

## `refresh_tokens`

One signed-in session for a staff member, traveller or operator; exactly one of user_id, traveller_id, operator_id is filled.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `user_id` | BIGINT UNSIGNED | N | FK | `users.id` | CASCADE |  |  |
| `token_hash` | CHAR(64) | Y | UQ |  |  |  | SHA-256 hash only |
| `expires_at` | DATETIME | Y |  |  |  |  |  |
| `revoked_at` | DATETIME | N |  |  |  |  |  |
| `replaced_by_hash` | CHAR(64) | N |  |  |  |  | links a rotated token to its successor |
| `user_agent` | VARCHAR(255) | N |  |  |  |  |  |
| `ip_address` | VARCHAR(45) | N |  |  |  |  |  |
| `subject_type` | ENUM('staff','traveller','operator') | Y |  |  |  | staff |  |
| `traveller_id` | BIGINT UNSIGNED | N | FK | `travellers.id` | CASCADE |  |  |
| `operator_id` | BIGINT UNSIGNED | N | FK | `operators.id` | CASCADE |  |  |

## `destinations`

Country or region sold, with travel-guide and marketing content.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `code` | VARCHAR(10) | Y | UQ |  |  |  |  |
| `name` | VARCHAR(120) | Y |  |  |  |  |  |
| `country_code` | CHAR(2) | N |  |  |  |  |  |
| `region` | VARCHAR(60) | N |  |  |  |  |  |
| `currency_code` | CHAR(3) | Y |  |  |  | AUD |  |
| `max_altitude_metres` | INTEGER UNSIGNED | N |  |  |  |  |  |
| `advisory_notes` | TEXT | N |  |  |  |  |  |
| `is_active` | BOOLEAN | Y |  |  |  | true |  |
| `summary` | VARCHAR(500) | N |  |  |  |  |  |
| `hero_image_url` | VARCHAR(500) | N |  |  |  |  |  |
| `highlights` | JSON | N |  |  |  |  | list |
| `duration_days` | INTEGER UNSIGNED | N |  |  |  |  |  |
| `price_from_amount` | DECIMAL(10,2) | N |  |  |  |  |  |
| `price_from_currency_code` | CHAR(3) | N |  |  |  |  |  |
| `best_time_to_visit` | VARCHAR(200) | N |  |  |  |  |  |
| `fitness_level` | ENUM('easy','moderate','challenging','strenuous') | N |  |  |  |  |  |
| `what_to_pack` | JSON | N |  |  |  |  | list |
| `culture_notes` | TEXT | N |  |  |  |  |  |
| `attractions` | JSON | N |  |  |  |  | list |
| `things_to_know` | JSON | N |  |  |  |  | list |

## `document_requirements`

A document a destination requires of every traveller.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `destination_id` | BIGINT UNSIGNED | Y | FK | `destinations.id` | CASCADE |  |  |
| `type` | ENUM('passport','visa','insurance','health_declaration','permit','vaccination','other') | Y |  |  |  |  |  |
| `name` | VARCHAR(160) | Y |  |  |  |  |  |
| `description` | TEXT | N |  |  |  |  |  |
| `is_mandatory` | BOOLEAN | Y |  |  |  | true |  |
| `lead_time_days` | INTEGER UNSIGNED | Y |  |  |  | 14 | due date = departure minus this |
| `min_validity_months` | INTEGER UNSIGNED | N |  |  |  |  | passports |
| `requires_altitude_cover` | BOOLEAN | Y |  |  |  | false | insurance |
| `is_active` | BOOLEAN | Y |  |  |  | true |  |

Unique together: (`destination_id`, `type`, `name`).

## `travellers`

A person who travels; also holds their portal sign-in columns.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `first_name` | VARCHAR(100) | Y |  |  |  |  |  |
| `last_name` | VARCHAR(100) | Y |  |  |  |  |  |
| `email` | VARCHAR(255) | N |  |  |  |  | not unique |
| `phone` | VARCHAR(40) | N |  |  |  |  |  |
| `date_of_birth` | DATE | N |  |  |  |  |  |
| `nationality` | CHAR(2) | N |  |  |  |  |  |
| `passport_number` | VARCHAR(60) | N |  |  |  |  | masked in lists and for finance |
| `passport_country` | CHAR(2) | N |  |  |  |  |  |
| `passport_expiry` | DATE | N |  |  |  |  |  |
| `emergency_contact_name` | VARCHAR(160) | N |  |  |  |  |  |
| `emergency_contact_phone` | VARCHAR(40) | N |  |  |  |  |  |
| `emergency_contact_relationship` | VARCHAR(60) | N |  |  |  |  |  |
| `dietary_notes` | TEXT | N |  |  |  |  |  |
| `medical_notes` | TEXT | N |  |  |  |  | sensitive information |
| `created_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `is_active` | BOOLEAN | Y |  |  |  | true |  |
| `password_hash` | VARCHAR(255) | N |  |  |  |  |  |
| `portal_enabled` | BOOLEAN | Y |  |  |  | false |  |
| `invite_token_hash` | CHAR(64) | N |  |  |  |  |  |
| `invite_expires_at` | DATETIME | N |  |  |  |  | 72 hours |
| `invite_sent_at` | DATETIME | N |  |  |  |  |  |
| `portal_activated_at` | DATETIME | N |  |  |  |  |  |
| `last_login_at` | DATETIME | N |  |  |  |  |  |
| `failed_login_attempts` | INTEGER UNSIGNED | Y |  |  |  | 0 |  |
| `locked_until` | DATETIME | N |  |  |  |  |  |

## `traveller_documents`

A document a traveller holds, with status and optional uploaded file.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `traveller_id` | BIGINT UNSIGNED | Y | FK | `travellers.id` | CASCADE |  |  |
| `destination_id` | BIGINT UNSIGNED | N | FK | `destinations.id` | SET NULL |  |  |
| `type` | ENUM('passport','visa','insurance','health_declaration','permit','vaccination','other') | Y |  |  |  |  |  |
| `reference` | VARCHAR(120) | N |  |  |  |  |  |
| `issuer` | VARCHAR(160) | N |  |  |  |  |  |
| `issued_on` | DATE | N |  |  |  |  |  |
| `expires_on` | DATE | N |  |  |  |  | expired status is computed |
| `status` | ENUM('outstanding','submitted','verified','rejected') | Y |  |  |  | outstanding |  |
| `altitude_cover_metres` | INTEGER UNSIGNED | N |  |  |  |  | insurance |
| `insurer_contact_phone` | VARCHAR(40) | N |  |  |  |  |  |
| `verified_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `verified_at` | DATETIME | N |  |  |  |  |  |
| `notes` | TEXT | N |  |  |  |  |  |
| `file_path` | VARCHAR(500) | N |  |  |  |  | external link |
| `stored_file_name` | VARCHAR(300) | N |  |  |  |  | random UUID name |
| `original_file_name` | VARCHAR(255) | N |  |  |  |  |  |
| `file_mime_type` | VARCHAR(100) | N |  |  |  |  |  |
| `file_size_bytes` | INTEGER UNSIGNED | N |  |  |  |  |  |
| `operator_confirmation_id` | BIGINT UNSIGNED | N | FK | `operator_confirmations.id` | SET NULL |  |  |

## `bookings`

One trip.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `reference` | VARCHAR(20) | Y | UQ |  |  |  | e.g. TA-2026-0007 |
| `title` | VARCHAR(200) | Y |  |  |  |  |  |
| `status` | ENUM('enquiry','quoted','confirmed','in_progress','completed','cancelled') | Y |  |  |  | enquiry |  |
| `consultant_id` | BIGINT UNSIGNED | Y | FK | `users.id` | RESTRICT |  |  |
| `coordinator_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `lead_traveller_id` | BIGINT UNSIGNED | N | FK | `travellers.id` | SET NULL |  |  |
| `departure_date` | DATE | N |  |  |  |  |  |
| `return_date` | DATE | N |  |  |  |  |  |
| `party_size` | INTEGER UNSIGNED | Y |  |  |  | 1 |  |
| `currency_code` | CHAR(3) | Y |  |  |  | AUD | base currency for payments |
| `total_amount` | DECIMAL(12,2) | N |  |  |  |  |  |
| `deposit_amount` | DECIMAL(12,2) | N |  |  |  |  |  |
| `notes` | TEXT | N |  |  |  |  |  |
| `cancelled_at` | DATETIME | N |  |  |  |  |  |
| `cancellation_reason` | VARCHAR(500) | N |  |  |  |  |  |
| `created_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |

## `booking_travellers`

Puts a traveller on a booking (junction table).

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `booking_id` | BIGINT UNSIGNED | Y | FK | `bookings.id` | CASCADE |  |  |
| `traveller_id` | BIGINT UNSIGNED | Y | FK | `travellers.id` | CASCADE |  |  |
| `is_lead` | BOOLEAN | Y |  |  |  | false |  |
| `notes` | VARCHAR(500) | N |  |  |  |  |  |

Unique together: (`booking_id`, `traveller_id`).

## `itinerary_segments`

One ordered leg of a booking in one destination.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `booking_id` | BIGINT UNSIGNED | Y | FK | `bookings.id` | CASCADE |  |  |
| `destination_id` | BIGINT UNSIGNED | Y | FK | `destinations.id` | RESTRICT |  |  |
| `sequence` | INTEGER UNSIGNED | Y |  |  |  |  |  |
| `title` | VARCHAR(200) | Y |  |  |  |  |  |
| `description` | TEXT | N |  |  |  |  |  |
| `start_date` | DATE | N |  |  |  |  |  |
| `end_date` | DATE | N |  |  |  |  |  |
| `accommodation` | VARCHAR(300) | N |  |  |  |  |  |
| `transport_notes` | TEXT | N |  |  |  |  |  |
| `max_altitude_metres` | INTEGER UNSIGNED | N |  |  |  |  | feeds insurance altitude check |

Unique together: (`booking_id`, `sequence`).

## `location_consents`

A traveller’s consent to share location on one booking.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `traveller_id` | BIGINT UNSIGNED | Y | FK | `travellers.id` | CASCADE |  |  |
| `booking_id` | BIGINT UNSIGNED | Y | FK | `bookings.id` | CASCADE |  |  |
| `status` | ENUM('granted','withdrawn') | Y |  |  |  | withdrawn |  |
| `granted_at` | DATETIME | N |  |  |  |  |  |
| `withdrawn_at` | DATETIME | N |  |  |  |  |  |
| `consent_statement` | VARCHAR(500) | N |  |  |  |  | exact wording agreed to |

Unique together: (`traveller_id`, `booking_id`).

## `location_pings`

One recorded position; deleted 30 days after the trip ends.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `traveller_id` | BIGINT UNSIGNED | Y | FK | `travellers.id` | CASCADE |  |  |
| `booking_id` | BIGINT UNSIGNED | Y | FK | `bookings.id` | CASCADE |  |  |
| `latitude` | DECIMAL(9,6) | Y |  |  |  |  |  |
| `longitude` | DECIMAL(9,6) | Y |  |  |  |  |  |
| `accuracy_metres` | INTEGER UNSIGNED | N |  |  |  |  |  |
| `altitude_metres` | INTEGER | N |  |  |  |  |  |
| `battery_percent` | INTEGER UNSIGNED | N |  |  |  |  |  |
| `source` | ENUM('device','manual','sos') | Y |  |  |  | device |  |
| `recorded_at` | DATETIME | Y |  |  |  |  |  |

## `sos_alerts`

Emergency alert raised by a traveller on a booking; kept indefinitely.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `traveller_id` | BIGINT UNSIGNED | Y | FK | `travellers.id` | RESTRICT |  |  |
| `booking_id` | BIGINT UNSIGNED | Y | FK | `bookings.id` | RESTRICT |  |  |
| `status` | ENUM('raised','acknowledged','resolved','cancelled') | Y |  |  |  | raised |  |
| `raised_at` | DATETIME | Y |  |  |  |  |  |
| `latitude` | DECIMAL(9,6) | N |  |  |  |  |  |
| `longitude` | DECIMAL(9,6) | N |  |  |  |  |  |
| `accuracy_metres` | INTEGER UNSIGNED | N |  |  |  |  |  |
| `message` | VARCHAR(500) | N |  |  |  |  |  |
| `acknowledged_at` | DATETIME | N |  |  |  |  |  |
| `acknowledged_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `resolved_at` | DATETIME | N |  |  |  |  |  |
| `resolved_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `resolution_notes` | TEXT | N |  |  |  |  | required to resolve |
| `cancelled_at` | DATETIME | N |  |  |  |  |  |
| `assigned_to_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `assigned_at` | DATETIME | N |  |  |  |  |  |
| `assigned_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |

## `sos_alert_events`

One entry in an alert’s history; append-only; never holds coordinates.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `alert_id` | BIGINT UNSIGNED | Y | FK | `sos_alerts.id` | CASCADE |  |  |
| `type` | ENUM('raised','acknowledged','assigned','unassigned','escalated','resolved','cancelled') | Y |  |  |  |  |  |
| `actor_kind` | ENUM('traveller','staff','system') | Y |  |  |  |  |  |
| `actor_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `detail` | VARCHAR(1000) | N |  |  |  |  |  |

## `tasks`

A piece of work on a booking, manual or generated from a document gap.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `booking_id` | BIGINT UNSIGNED | Y | FK | `bookings.id` | CASCADE |  |  |
| `traveller_id` | BIGINT UNSIGNED | N | FK | `travellers.id` | SET NULL |  |  |
| `title` | VARCHAR(200) | Y |  |  |  |  |  |
| `description` | TEXT | N |  |  |  |  |  |
| `category` | ENUM('documents','payment','operator','itinerary','admin','other') | Y |  |  |  | other |  |
| `status` | ENUM('open','in_progress','blocked','done','cancelled') | Y |  |  |  | open |  |
| `priority` | ENUM('low','normal','high','urgent') | Y |  |  |  | normal |  |
| `due_on` | DATE | N |  |  |  |  |  |
| `assigned_to_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `created_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `source` | ENUM('manual','readiness') | Y |  |  |  | manual |  |
| `source_key` | VARCHAR(120) | N |  |  |  |  | identifies the document gap |
| `blocked_reason` | VARCHAR(500) | N |  |  |  |  |  |
| `completed_at` | DATETIME | N |  |  |  |  |  |
| `completed_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `document_id` | BIGINT UNSIGNED | N |  |  |  |  | logical link to traveller_documents, no DB constraint |

Unique together: (`booking_id`, `source_key`).

## `task_events`

One entry in a task’s history; append-only.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `task_id` | BIGINT UNSIGNED | Y | FK | `tasks.id` | CASCADE |  |  |
| `type` | ENUM('created','assigned','unassigned','status_changed','note','edited','handover') | Y |  |  |  |  |  |
| `actor_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `from_value` | VARCHAR(120) | N |  |  |  |  |  |
| `to_value` | VARCHAR(120) | N |  |  |  |  |  |
| `note` | VARCHAR(1000) | N |  |  |  |  |  |

## `notifications`

One in-app message to one staff member, traveller or operator; exactly one of user_id, traveller_id, operator_id is filled.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `user_id` | BIGINT UNSIGNED | N | FK | `users.id` | CASCADE |  |  |
| `actor_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `type` | ENUM('sos_raised','sos_acknowledged','sos_resolved','task_assigned','task_handover','task_overdue','document_verified','document_rejected','portal_activated','booking_cancelled','payment_received','payment_failed','payment_due_soon','payment_overdue','booking_enquiry_received','document_submitted','contact_message_received','operator_declined','operator_confirmation_requested','sos_assigned','sos_escalated') | Y |  |  |  |  | 21 types |
| `severity` | ENUM('info','warning','urgent') | Y |  |  |  | info |  |
| `title` | VARCHAR(200) | Y |  |  |  |  |  |
| `body` | VARCHAR(500) | N |  |  |  |  |  |
| `link` | VARCHAR(200) | N |  |  |  |  |  |
| `dedupe_key` | VARCHAR(120) | N |  |  |  |  | stops repeats |
| `read_at` | DATETIME | N |  |  |  |  |  |
| `traveller_id` | BIGINT UNSIGNED | N |  |  |  |  | no DB constraint |
| `operator_id` | BIGINT UNSIGNED | N |  |  |  |  | no DB constraint |

Unique together: (`user_id`, `dedupe_key`).

## `operators`

A local supplier in one destination, with portal sign-in columns.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `name` | VARCHAR(180) | Y |  |  |  |  |  |
| `destination_id` | BIGINT UNSIGNED | Y | FK | `destinations.id` | RESTRICT |  |  |
| `type` | ENUM('guide','accommodation','transport','permits','equipment','full_service','other') | Y |  |  |  | full_service |  |
| `contact_name` | VARCHAR(160) | N |  |  |  |  |  |
| `contact_email` | VARCHAR(255) | N |  |  |  |  |  |
| `contact_phone` | VARCHAR(40) | N |  |  |  |  |  |
| `whatsapp` | VARCHAR(40) | N |  |  |  |  |  |
| `typical_response_days` | INTEGER UNSIGNED | Y |  |  |  | 3 | sets default deadlines |
| `vetted_at` | DATETIME | N |  |  |  |  |  |
| `vetted_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `vetting_notes` | TEXT | N |  |  |  |  |  |
| `notes` | TEXT | N |  |  |  |  |  |
| `is_active` | BOOLEAN | Y |  |  |  | true |  |
| `password_hash` | VARCHAR(255) | N |  |  |  |  |  |
| `portal_enabled` | BOOLEAN | Y |  |  |  | false |  |
| `invite_token_hash` | CHAR(64) | N |  |  |  |  |  |
| `invite_expires_at` | DATETIME | N |  |  |  |  |  |
| `invite_sent_at` | DATETIME | N |  |  |  |  |  |
| `portal_activated_at` | DATETIME | N |  |  |  |  |  |
| `last_login_at` | DATETIME | N |  |  |  |  |  |
| `failed_login_attempts` | INTEGER UNSIGNED | Y |  |  |  | 0 |  |
| `locked_until` | DATETIME | N |  |  |  |  |  |

Unique together: (`destination_id`, `name`).

## `operator_confirmations`

A request to an operator for a service on a booking, and the answer.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `booking_id` | BIGINT UNSIGNED | Y | FK | `bookings.id` | CASCADE |  |  |
| `operator_id` | BIGINT UNSIGNED | Y | FK | `operators.id` | RESTRICT |  |  |
| `itinerary_segment_id` | BIGINT UNSIGNED | N | FK | `itinerary_segments.id` | SET NULL |  |  |
| `service_type` | ENUM('guide','accommodation','transport','permits','equipment','other') | Y |  |  |  | other |  |
| `summary` | VARCHAR(300) | Y |  |  |  |  |  |
| `details` | TEXT | N |  |  |  |  |  |
| `status` | ENUM('pending','requested','confirmed','declined','cancelled') | Y |  |  |  | pending |  |
| `operator_reference` | VARCHAR(120) | N |  |  |  |  |  |
| `due_by` | DATE | N |  |  |  |  |  |
| `requested_at` | DATETIME | N |  |  |  |  |  |
| `responded_at` | DATETIME | N |  |  |  |  |  |
| `currency_code` | CHAR(3) | Y |  |  |  | AUD | operator’s quote |
| `amount` | DECIMAL(12,2) | N |  |  |  |  | operator’s quote |
| `decline_reason` | VARCHAR(500) | N |  |  |  |  |  |
| `created_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `updated_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |

## `payment_schedules`

An instalment: an amount due on a booking by a date (no paid column; paid is computed from payments).

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `booking_id` | BIGINT UNSIGNED | Y | FK | `bookings.id` | CASCADE |  |  |
| `label` | VARCHAR(120) | Y |  |  |  |  |  |
| `sequence` | INTEGER UNSIGNED | Y |  |  |  | 1 |  |
| `due_on` | DATE | Y |  |  |  |  |  |
| `currency_code` | CHAR(3) | Y |  |  |  | AUD |  |
| `amount` | DECIMAL(12,2) | Y |  |  |  |  |  |
| `status` | ENUM('scheduled','waived','cancelled') | Y |  |  |  | scheduled |  |
| `waived_reason` | VARCHAR(500) | N |  |  |  |  |  |
| `notes` | TEXT | N |  |  |  |  |  |
| `created_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `updated_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |

## `payments`

One movement of money on a booking, in or out; amount_in_base = amount x exchange_rate, fixed at entry.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `booking_id` | BIGINT UNSIGNED | Y | FK | `bookings.id` | CASCADE |  |  |
| `payment_schedule_id` | BIGINT UNSIGNED | N | FK | `payment_schedules.id` | SET NULL |  |  |
| `operator_confirmation_id` | BIGINT UNSIGNED | N | FK | `operator_confirmations.id` | SET NULL |  |  |
| `direction` | ENUM('incoming','outgoing') | Y |  |  |  | incoming |  |
| `method` | ENUM('bank_transfer','card','cash','cheque','agent_credit','other') | Y |  |  |  | bank_transfer |  |
| `status` | ENUM('pending','cleared','failed','refunded') | Y |  |  |  | pending |  |
| `currency_code` | CHAR(3) | Y |  |  |  | AUD |  |
| `amount` | DECIMAL(12,2) | Y |  |  |  |  |  |
| `base_currency_code` | CHAR(3) | Y |  |  |  | AUD |  |
| `exchange_rate` | DECIMAL(16,8) | Y |  |  |  | 1 |  |
| `amount_in_base` | DECIMAL(12,2) | Y |  |  |  |  |  |
| `reference` | VARCHAR(120) | N |  |  |  |  | unique per direction |
| `received_on` | DATE | Y |  |  |  |  |  |
| `cleared_at` | DATETIME | N |  |  |  |  |  |
| `settled_reason` | VARCHAR(500) | N |  |  |  |  | required for failed or refunded |
| `notes` | TEXT | N |  |  |  |  |  |
| `recorded_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |
| `updated_by_user_id` | BIGINT UNSIGNED | N | FK | `users.id` | SET NULL |  |  |

Unique together: (`direction`, `reference`).

## `testimonials`

A published traveller quote, optionally about one destination.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `destination_id` | BIGINT UNSIGNED | N | FK | `destinations.id` | CASCADE |  |  |
| `author_name` | VARCHAR(160) | Y |  |  |  |  |  |
| `trip_reference` | VARCHAR(20) | N |  |  |  |  |  |
| `quote` | TEXT | Y |  |  |  |  |  |
| `rating` | TINYINT UNSIGNED | N |  |  |  |  |  |
| `is_published` | BOOLEAN | Y |  |  |  | true |  |

## `contact_messages`

General message from the public site; no links to other tables.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `name` | VARCHAR(160) | Y |  |  |  |  |  |
| `email` | VARCHAR(255) | Y |  |  |  |  |  |
| `phone` | VARCHAR(40) | N |  |  |  |  |  |
| `message` | TEXT | Y |  |  |  |  |  |

## `email_logs`

One attempt to send an email; no links to other tables.

| Column | Type | Req. | Key | References | On parent delete | Default | Notes |
|---|---|---|---|---|---|---|---|
| `id` | BIGINT UNSIGNED | Y | PK |  |  | auto-increment | PK |
| `to_address` | VARCHAR(255) | Y |  |  |  |  |  |
| `subject` | VARCHAR(255) | Y |  |  |  |  |  |
| `context` | VARCHAR(120) | N |  |  |  |  | e.g. notification:sos_raised |
| `status` | ENUM('sent','failed','skipped') | Y |  |  |  |  |  |
| `error` | TEXT | N |  |  |  |  |  |

## Relationships (parent → child)

| Parent | Child | Foreign key | Parent optional? | On parent delete |
|---|---|---|---|---|
| `users` | `refresh_tokens` | `user_id` | yes | CASCADE |
| `travellers` | `refresh_tokens` | `traveller_id` | yes | CASCADE |
| `operators` | `refresh_tokens` | `operator_id` | yes | CASCADE |
| `destinations` | `document_requirements` | `destination_id` | no | CASCADE |
| `users` | `travellers` | `created_by_user_id` | yes | SET NULL |
| `travellers` | `traveller_documents` | `traveller_id` | no | CASCADE |
| `destinations` | `traveller_documents` | `destination_id` | yes | SET NULL |
| `users` | `traveller_documents` | `verified_by_user_id` | yes | SET NULL |
| `operator_confirmations` | `traveller_documents` | `operator_confirmation_id` | yes | SET NULL |
| `users` | `bookings` | `consultant_id` | no | RESTRICT |
| `users` | `bookings` | `coordinator_id` | yes | SET NULL |
| `travellers` | `bookings` | `lead_traveller_id` | yes | SET NULL |
| `users` | `bookings` | `created_by_user_id` | yes | SET NULL |
| `bookings` | `booking_travellers` | `booking_id` | no | CASCADE |
| `travellers` | `booking_travellers` | `traveller_id` | no | CASCADE |
| `bookings` | `itinerary_segments` | `booking_id` | no | CASCADE |
| `destinations` | `itinerary_segments` | `destination_id` | no | RESTRICT |
| `travellers` | `location_consents` | `traveller_id` | no | CASCADE |
| `bookings` | `location_consents` | `booking_id` | no | CASCADE |
| `travellers` | `location_pings` | `traveller_id` | no | CASCADE |
| `bookings` | `location_pings` | `booking_id` | no | CASCADE |
| `travellers` | `sos_alerts` | `traveller_id` | no | RESTRICT |
| `bookings` | `sos_alerts` | `booking_id` | no | RESTRICT |
| `users` | `sos_alerts` | `acknowledged_by_user_id` | yes | SET NULL |
| `users` | `sos_alerts` | `resolved_by_user_id` | yes | SET NULL |
| `users` | `sos_alerts` | `assigned_to_user_id` | yes | SET NULL |
| `users` | `sos_alerts` | `assigned_by_user_id` | yes | SET NULL |
| `sos_alerts` | `sos_alert_events` | `alert_id` | no | CASCADE |
| `users` | `sos_alert_events` | `actor_user_id` | yes | SET NULL |
| `bookings` | `tasks` | `booking_id` | no | CASCADE |
| `travellers` | `tasks` | `traveller_id` | yes | SET NULL |
| `users` | `tasks` | `assigned_to_user_id` | yes | SET NULL |
| `users` | `tasks` | `created_by_user_id` | yes | SET NULL |
| `users` | `tasks` | `completed_by_user_id` | yes | SET NULL |
| `tasks` | `task_events` | `task_id` | no | CASCADE |
| `users` | `task_events` | `actor_user_id` | yes | SET NULL |
| `users` | `notifications` | `user_id` | yes | CASCADE |
| `users` | `notifications` | `actor_user_id` | yes | SET NULL |
| `destinations` | `operators` | `destination_id` | no | RESTRICT |
| `users` | `operators` | `vetted_by_user_id` | yes | SET NULL |
| `bookings` | `operator_confirmations` | `booking_id` | no | CASCADE |
| `operators` | `operator_confirmations` | `operator_id` | no | RESTRICT |
| `itinerary_segments` | `operator_confirmations` | `itinerary_segment_id` | yes | SET NULL |
| `users` | `operator_confirmations` | `created_by_user_id` | yes | SET NULL |
| `users` | `operator_confirmations` | `updated_by_user_id` | yes | SET NULL |
| `bookings` | `payment_schedules` | `booking_id` | no | CASCADE |
| `users` | `payment_schedules` | `created_by_user_id` | yes | SET NULL |
| `users` | `payment_schedules` | `updated_by_user_id` | yes | SET NULL |
| `bookings` | `payments` | `booking_id` | no | CASCADE |
| `payment_schedules` | `payments` | `payment_schedule_id` | yes | SET NULL |
| `operator_confirmations` | `payments` | `operator_confirmation_id` | yes | SET NULL |
| `users` | `payments` | `recorded_by_user_id` | yes | SET NULL |
| `users` | `payments` | `updated_by_user_id` | yes | SET NULL |
| `destinations` | `testimonials` | `destination_id` | yes | CASCADE |

Logical links with no database constraint: `notifications.traveller_id`, `notifications.operator_id`, `tasks.document_id`.
