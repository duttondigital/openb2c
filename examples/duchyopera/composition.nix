# Duchy Opera composition: imports modules and evaluates schema
let
  lib = import <nixpkgs/lib>;
  composeLib = import ../../schema/lib/compose.nix { inherit lib; };

  modules = lib.evalModules {
    modules = [
      ../../schema/base.nix
      ({ config, ... }: {
        organization = {
          name = "Duchy Opera";
          description = "The Cornish Opera Company";
          logo = {
            src = ./logo/duchy-opera-icon.svg;
            alt = "Duchy Opera";
          };
        };
        seed = {
          applyFixturesByDefault = true;
          reference.venue = [
            {
              id = 1;
              name = "Hall for Cornwall";
              address = "Back Quay";
              city = "Truro";
              postcode = "TR1 2LL";
              capacity = 900;
              active = 1;
            }
          ];
          fixtures = {
            user = [
              {
                id = 1;
                email = "ada@example.test";
                name = "Ada Lovelace";
                customer_type = "patron";
              }
            ];
            artist = [
              {
                id = 1;
                name = "Elowen Trevorrow";
                role = "Soprano";
                bio = "Cornish soprano performing as Pamina.";
                active = 1;
              }
              {
                id = 2;
                name = "Morgan Trelawny";
                role = "Conductor";
                bio = "Music director for the Duchy Opera summer season.";
                active = 1;
              }
            ];
            production = [
              {
                id = 1;
                title = "The Magic Flute";
                season = "Summer 2026";
                description = "Duchy Opera pilot production for internal scheduling and public ticketing.";
                status = "active";
              }
            ];
            production_role = [
              {
                id = 1;
                production_id = 1;
                name = "Pamina";
                category = "cast";
                description = "Principal soprano role.";
                required_count = 1;
                status = "filled";
              }
              {
                id = 2;
                production_id = 1;
                name = "Music director";
                category = "creative";
                description = "Conductor and music preparation lead.";
                required_count = 1;
                status = "filled";
              }
            ];
            production_member = [
              {
                id = 1;
                production_id = 1;
                artist_id = 1;
                role_id = 1;
                responsibility = "Pamina";
                status = "confirmed";
              }
              {
                id = 2;
                production_id = 1;
                artist_id = 2;
                role_id = 2;
                responsibility = "Conductor";
                status = "confirmed";
              }
            ];
            rehearsal = [
              {
                id = 1;
                production_id = 1;
                title = "Act I music call";
                venue_id = 1;
                starts_at = "2026-05-20T18:30:00Z";
                ends_at = "2026-05-20T21:30:00Z";
                status = "published";
                notes = "Cover Pamina entrance and Act I finale.";
              }
            ];
            rehearsal_call = [
              {
                id = 1;
                rehearsal_id = 1;
                artist_id = 1;
                role_id = 1;
                call_status = "confirmed";
                notes = "Called for full session.";
              }
              {
                id = 2;
                rehearsal_id = 1;
                artist_id = 2;
                role_id = 2;
                call_status = "confirmed";
                notes = "Music director call.";
              }
            ];
            rehearsal_requirement = [
              {
                id = 1;
                production_id = 1;
                name = "Act I finale";
                category = "music";
                required_sessions = 2;
                status = "scheduled";
              }
            ];
            rehearsal_coverage = [
              {
                id = 1;
                requirement_id = 1;
                rehearsal_id = 1;
                status = "planned";
                notes = "First coverage pass.";
              }
            ];
            production_material = [
              {
                id = 1;
                production_id = 1;
                title = "Current vocal score";
                kind = "score";
                visibility = "participants";
                status = "current";
                description = "Authoritative vocal score for the Summer 2026 production.";
              }
            ];
            material_version = [
              {
                id = 1;
                material_id = 1;
                version_label = "v1";
                storage_uri = "duchyopera://materials/magic-flute/vocal-score-v1.pdf";
                checksum = "fixture";
                status = "current";
                notes = "Initial rehearsal score.";
                created_by_user_id = 1;
              }
            ];
            performance = [
              {
                id = 1;
                production_id = 1;
                title = "The Magic Flute";
                venue_id = 1;
                date = "2026-06-12";
                time = "19:30";
                duration_mins = 150;
                price_pence = 2500;
                description = "Mozart's final opera staged for a Cornish charity audience.";
                status = "scheduled";
              }
              {
                id = 2;
                production_id = 1;
                title = "Cancelled Gala";
                venue_id = 1;
                date = "2026-06-13";
                time = "19:30";
                duration_mins = 120;
                price_pence = 3000;
                description = "Fixture used to prove unavailable catalog items stay out of checkout.";
                status = "cancelled";
              }
            ];
          };
        };
        ecommerce = {
          enabled = true;
          catalog = {
            entity = "performance";
            title = config.refs.performance.title;
            description = config.refs.performance.description;
            price = config.refs.performance.price_pence;
            groupBy = [ config.refs.performance.title ];
            variantFields = [
              config.refs.performance.date
              config.refs.performance.time
              config.refs.performance.venue_id
            ];
            availability = {
              field = config.refs.performance.status;
              available = "scheduled";
            };
          };
          order = {
            entity = "booking";
            user = config.refs.booking.user_id;
            status = config.refs.booking.status;
            amount = config.refs.booking.amount_pence;
            currency = config.refs.booking.currency;
            expiresAt = config.refs.booking.expires_at;
            paymentReference = config.refs.booking.payment_reference;
            client = config.refs.booking.client;
            pendingStatus = "checkout_pending";
            paidStatus = "paid";
            expiredStatus = "expired";
            cancelledStatus = "cancelled";
          };
          lineItem = {
            entity = "ticket";
            catalogItem = config.refs.ticket.performance_id;
            user = config.refs.ticket.user_id;
            price = config.refs.ticket.price_pence;
            status = config.refs.ticket.status;
            reservedStatus = "reserved";
            fulfilledStatus = "confirmed";
            cancelledStatus = "cancelled";
            options = {
              ticket_type = {
                field = config.refs.ticket.ticket_type;
                label = "Ticket type";
                default = "standard";
                choices = [ "standard" "concession" "patron" ];
              };
              seat = {
                field = config.refs.ticket.seat;
                label = "Seat";
              };
            };
          };
          orderLine = {
            entity = "booking_ticket";
            order = config.refs.booking_ticket.booking_id;
            lineItem = config.refs.booking_ticket.ticket_id;
          };
          transaction = {
            entity = "transaction";
            user = config.refs.transaction.user_id;
            amount = config.refs.transaction.amount_pence;
            type = config.refs.transaction.type;
            status = config.refs.transaction.status;
            reference = config.refs.transaction.reference;
            client = config.refs.transaction.client;
            purchaseType = "purchase";
            pendingStatus = "pending";
            completedStatus = "completed";
            failedStatus = "failed";
          };
          transactionLine = {
            entity = "transaction_ticket";
            transaction = config.refs.transaction_ticket.transaction_id;
            lineItem = config.refs.transaction_ticket.ticket_id;
          };
          checkout = {
            currency = "GBP";
            expiryMinutes = 15;
            maxQuantity = 20;
            maxLines = 50;
          };
        };
      })
      ../../schema/modules/identity.nix
      ../../schema/modules/user.nix
      ../../schema/modules/user_b2c.nix  # Adds customer_type to user
      ../../schema/modules/api_key.nix
      ../../schema/modules/artist.nix
      ../../schema/modules/performance.nix
      ../../schema/modules/ticket.nix
      ../../schema/modules/transaction.nix
      ../../schema/modules/booking.nix
      ../../schema/modules/venue.nix
      ../../schema/bundles/production-scheduling.nix
      ../../schema/bundles/materials-library.nix
    ];
  };

in {
  organization = modules.config.organization;
  auth = modules.config.auth;
  audit = modules.config.audit;
  seed = modules.config.seed;
  integrations = modules.config.integrations;
  workflows = modules.config.workflows;
  tables = modules.config.tables;
  derived = modules.config.derived;
  indexes = modules.config.indexes;
  refs = modules.config.refs;
  relationships = modules.config.relationships;
  validations = modules.config.validations;
  operations = composeLib.processOperations modules.config.tables modules.config.relationships modules.config.operations;
  ecommerce = modules.config.ecommerce;
}
