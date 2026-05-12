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
    ];
  };

in {
  organization = modules.config.organization;
  auth = modules.config.auth;
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
