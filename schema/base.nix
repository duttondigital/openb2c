# Base module: defines option types for tables, relationships, operations, effects
{ lib, config, ... }:

let
  logoType = lib.types.submodule {
    options = {
      src = lib.mkOption {
        type = lib.types.either lib.types.str lib.types.path;
        description = "Logo URL or Nix path copied into generated UI assets.";
      };
      alt = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Accessible logo alternative text. Defaults to '<organization name> logo'.";
      };
    };
  };

  # Organization metadata describes the top-level entity the generated app belongs to.
  organizationType = lib.types.submodule {
    options = {
      name = lib.mkOption {
        type = lib.types.str;
        default = "OpenB2C";
        description = "Human-readable organization or product name.";
      };
      description = lib.mkOption {
        type = lib.types.str;
        default = "Generated OpenB2C organization";
        description = "Organization or product description.";
      };
      logo = lib.mkOption {
        type = lib.types.nullOr logoType;
        default = null;
        description = "Optional logo displayed beside generated app titles.";
      };
    };
  };

  audienceType = lib.types.enum [ "anonymous" "customer" "staff" "service" "system" ];

  authRoleType = lib.types.submodule {
    options = {
      label = lib.mkOption { type = lib.types.str; };
      description = lib.mkOption { type = lib.types.str; default = ""; };
      audience = lib.mkOption {
        type = lib.types.enum [ "customer" "staff" "service" "system" ];
        description = "Identity audience this role belongs to.";
      };
      defaultScopes = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Scopes normally issued for this role. Enforcement still consumes normalized scopes.";
      };
      internal = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether this role is intended for generated system/runtime use rather than end users.";
      };
    };
  };

  authType = lib.types.submodule {
    options = {
      roles = lib.mkOption {
        type = lib.types.attrsOf authRoleType;
        default = {
          customer = {
            label = "Customer";
            description = "Authenticated customer identity for self-service account and owned-resource access.";
            audience = "customer";
            defaultScopes = [];
            internal = false;
          };
          staff = {
            label = "Staff";
            description = "Authenticated staff/operator identity for administrative workflows.";
            audience = "staff";
            defaultScopes = [];
            internal = false;
          };
          service = {
            label = "Service";
            description = "User-bound API key or integration identity for service-to-service access.";
            audience = "service";
            defaultScopes = [];
            internal = false;
          };
          system = {
            label = "System";
            description = "Trusted local system execution with the explicit wildcard scope.";
            audience = "system";
            defaultScopes = [ "*" ];
            internal = true;
          };
        };
        description = "Role metadata for generated documentation and clients. Runtime authorization still uses scopes.";
      };
    };
  };

  workflowGroupType = lib.types.submodule {
    options = {
      label = lib.mkOption {
        type = lib.types.str;
        description = "Human-readable workflow group label.";
      };
      description = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Optional workflow group description.";
      };
      displayPriority = lib.mkOption {
        type = lib.types.nullOr lib.types.int;
        default = null;
        description = "Lower values appear earlier in generated workflow displays.";
      };
    };
  };

  workflowsType = lib.types.submodule {
    options = {
      groups = lib.mkOption {
        type = lib.types.attrsOf workflowGroupType;
        default = {};
        description = "Reusable operation group metadata for generated workflow clients.";
      };
    };
  };

  auditCategoryType = lib.types.enum [ "data" "workflow" "security" "payment" "system" ];

  auditEntityType = lib.types.submodule {
    options = {
      operations = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [ "create" "update" "delete" ];
        description = "Entity operations that must be audit logged.";
      };
      category = lib.mkOption {
        type = auditCategoryType;
        default = "data";
        description = "Default audit category for this entity.";
      };
      reason = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Why this entity requires audit logging.";
      };
    };
  };

  auditType = lib.types.submodule {
    options = {
      entities = lib.mkOption {
        type = lib.types.attrsOf auditEntityType;
        default = {};
        description = "Entity-level audit logging requirements.";
      };
    };
  };

  seedValueType = lib.types.nullOr (lib.types.oneOf [
    lib.types.str
    lib.types.int
    lib.types.number
    lib.types.bool
  ]);

  seedRowType = lib.types.attrsOf seedValueType;

  seedType = lib.types.submodule {
    options = {
      reference = lib.mkOption {
        type = lib.types.attrsOf (lib.types.listOf seedRowType);
        default = {};
        description = "Stable reference data inserted or updated during runtime bootstrap.";
      };
      fixtures = lib.mkOption {
        type = lib.types.attrsOf (lib.types.listOf seedRowType);
        default = {};
        description = "Example or demo rows generated separately and applied only when fixtures are enabled.";
      };
      applyFixturesByDefault = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Apply fixture seed data by default in non-production runtime environments.";
      };
    };
  };

  integrationEnvVarType = lib.types.submodule {
    options = {
      description = lib.mkOption {
        type = lib.types.str;
        default = "";
        description = "Human-readable environment variable purpose.";
      };
      requiredInProduction = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Whether production startup must require this variable when the integration is used.";
      };
      secret = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether this variable must be supplied through deployment secrets.";
      };
      example = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Non-secret example value for generated environment templates.";
      };
    };
  };

  integrationEndpointType = lib.types.submodule {
    options = {
      provider = lib.mkOption {
        type = lib.types.str;
        default = "custom";
        description = "Provider implementation used by the generated integration handler.";
      };
      description = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Short generated-operator description for this integration.";
      };
      env = lib.mkOption {
        type = lib.types.attrsOf integrationEnvVarType;
        default = {};
        description = "Environment variable contract for this integration.";
      };
    };
  };

  webhookSigningType = lib.types.submodule {
    options = {
      enabled = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Whether generated outbound webhook effects include signatures.";
      };
      algorithm = lib.mkOption {
        type = lib.types.str;
        default = "sha256";
        description = "Signature algorithm label used in webhook signature headers.";
      };
      payload = lib.mkOption {
        type = lib.types.str;
        default = "timestamp.body";
        description = "Canonical signing payload shape.";
      };
      signatureHeader = lib.mkOption {
        type = lib.types.str;
        default = "X-OpenB2C-Signature";
        description = "HTTP header carrying the outbound webhook signature.";
      };
      timestampHeader = lib.mkOption {
        type = lib.types.str;
        default = "X-OpenB2C-Timestamp";
        description = "HTTP header carrying the outbound webhook timestamp.";
      };
      toleranceSeconds = lib.mkOption {
        type = lib.types.int;
        default = 300;
        description = "Default maximum age accepted by the generated webhook verifier.";
      };
    };
  };

  webhookIntegrationType = lib.types.submodule {
    options = {
      provider = lib.mkOption {
        type = lib.types.str;
        default = "openb2c";
        description = "Provider implementation used by the generated webhook handler.";
      };
      description = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Short generated-operator description for this integration.";
      };
      env = lib.mkOption {
        type = lib.types.attrsOf integrationEnvVarType;
        default = {};
        description = "Environment variable contract for this integration.";
      };
      signing = lib.mkOption {
        type = webhookSigningType;
        default = {};
        description = "Outbound webhook signature contract.";
      };
    };
  };

  integrationsType = lib.types.submodule {
    options = {
      identityEmail = lib.mkOption {
        type = integrationEndpointType;
        default = {
          provider = "resend";
          description = "Production identity OTP email delivery.";
          env = {
            EMAIL_PROVIDER = {
              description = "Email provider used for identity OTP delivery. Use resend for production or fake for local provider tests.";
              requiredInProduction = false;
              example = "resend";
            };
            RESEND_API_KEY = {
              description = "Resend API key used to send production identity OTP emails.";
              secret = true;
            };
            EMAIL_FROM = {
              description = "Verified sender address for production identity OTP emails.";
              example = "OpenB2C <login@example.com>";
            };
            IDENTITY_OTP_SUBJECT = {
              description = "Optional subject line override for identity OTP emails.";
              requiredInProduction = false;
            };
            RESEND_EMAILS_URL = {
              description = "Optional Resend emails API endpoint override for tests or proxies.";
              requiredInProduction = false;
              example = "https://api.resend.com/emails";
            };
          };
        };
        description = "Identity challenge email integration metadata.";
      };
      emailEffects = lib.mkOption {
        type = integrationEndpointType;
        default = {
          provider = "webhook";
          description = "Generated email effect dispatch endpoint.";
          env.EMAIL_WEBHOOK_URL = {
            description = "Email provider dispatch endpoint used by generated email effects.";
            secret = true;
          };
        };
        description = "Email effect integration metadata.";
      };
      payment = lib.mkOption {
        type = integrationEndpointType;
        default = {
          provider = "stripe";
          description = "Generated payment-intent provider.";
          env = {
            PAYMENT_PROVIDER = {
              description = "Payment provider identifier. Use stripe for production or local/fake for development.";
              example = "stripe";
            };
            PAYMENT_API_KEY = {
              description = "Payment provider API key. For Stripe, use a Stripe secret key.";
              secret = true;
            };
            STRIPE_API_BASE = {
              description = "Optional Stripe API endpoint override for tests or proxies.";
              requiredInProduction = false;
              example = "https://api.stripe.com";
            };
          };
        };
        description = "Payment provider integration metadata.";
      };
      paymentWebhook = lib.mkOption {
        type = integrationEndpointType;
        default = {
          provider = "openb2c";
          description = "Inbound payment provider webhook verification.";
          env.PAYMENT_WEBHOOK_SECRET = {
            description = "Shared secret used to verify payment provider webhook signatures.";
            secret = true;
          };
        };
        description = "Payment webhook integration metadata.";
      };
      webhookEffects = lib.mkOption {
        type = webhookIntegrationType;
        default = {
          provider = "openb2c";
          description = "Generated outbound webhook effect dispatch.";
          env = {
            WEBHOOK_URL = {
              description = "Webhook dispatch endpoint used by generated webhook effects.";
              secret = true;
            };
            WEBHOOK_SIGNING_SECRET = {
              description = "Shared secret used to sign outbound OpenB2C webhook effects.";
              secret = true;
            };
            WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = {
              description = "Maximum accepted age for OpenB2C webhook signatures when using the generated verifier.";
              requiredInProduction = false;
              example = "300";
            };
          };
          signing = {
            enabled = true;
            algorithm = "sha256";
            payload = "timestamp.body";
            signatureHeader = "X-OpenB2C-Signature";
            timestampHeader = "X-OpenB2C-Timestamp";
            toleranceSeconds = 300;
          };
        };
        description = "Outbound webhook effect integration metadata.";
      };
    };
  };

  # Structured reference to a table field. These are generated under
  # `config.refs.<table>.<field>` so policy and metadata can avoid stringly
  # references.
  fieldRefType = lib.types.submodule {
    options = {
      table = lib.mkOption { type = lib.types.str; };
      field = lib.mkOption { type = lib.types.str; };
      references = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
    };
  };

  fieldMetadataType = lib.types.submodule {
    options = {
      label = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Human-readable field label for generated API descriptions and UI.";
      };
      helpText = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Short helper text shown beside generated inputs.";
      };
      placeholder = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Generated input placeholder.";
      };
      format = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Semantic field format such as email, date, time, url, money, or textarea.";
      };
      displayPriority = lib.mkOption {
        type = lib.types.nullOr lib.types.int;
        default = null;
        description = "Lower values appear earlier in generated forms, lists, and detail views.";
      };
      privacy = lib.mkOption {
        type = lib.types.enum [ "public" "internal" "sensitive" "secret" ];
        default = "public";
        description = "Field privacy classification for generated clients and API metadata.";
      };
      redact = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether generated API responses should omit this field.";
      };
    };
  };

  fieldValidationType = lib.types.submodule {
    options = {
      minLength = lib.mkOption {
        type = lib.types.nullOr lib.types.int;
        default = null;
        description = "Minimum string length.";
      };
      maxLength = lib.mkOption {
        type = lib.types.nullOr lib.types.int;
        default = null;
        description = "Maximum string length.";
      };
      minimum = lib.mkOption {
        type = lib.types.nullOr lib.types.number;
        default = null;
        description = "Minimum numeric value.";
      };
      maximum = lib.mkOption {
        type = lib.types.nullOr lib.types.number;
        default = null;
        description = "Maximum numeric value.";
      };
      pattern = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "JavaScript-compatible regular expression pattern.";
      };
      enum = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Allowed finite string values.";
      };
    };
  };

  derivedFieldType = lib.types.submodule {
    options = {
      type = lib.mkOption {
        type = lib.types.str;
        default = "text";
        description = "Generated TypeScript/OpenAPI type for the derived value.";
      };
      metadata = lib.mkOption {
        type = fieldMetadataType;
        default = {};
        description = "Presentation metadata for the derived display-only value.";
      };
      dependencies = lib.mkOption {
        type = lib.types.listOf fieldRefType;
        default = [];
        description = "Structured local fields used to compute this value.";
      };
      template = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "String template using {field_name} placeholders.";
      };
      expression = lib.mkOption {
        type = lib.types.nullOr lib.types.attrs;
        default = null;
        description = "Expression AST used to compute the value.";
      };
    };
  };

  fieldRelationshipType = lib.types.submodule {
    options = {
      label = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Human-readable relationship label for generated API descriptions and UI.";
      };
      description = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Short explanation of the relationship.";
      };
      cardinality = lib.mkOption {
        type = lib.types.enum [ "one" "many" ];
        default = "one";
        description = "Relationship cardinality from the source row to the target entity.";
      };
      targetLabel = lib.mkOption {
        type = lib.types.nullOr fieldRefType;
        default = null;
        description = "Target entity field used to label choices and related records.";
      };
    };
  };

  # Column definition
  columnType = lib.types.submodule {
    options = {
      type = lib.mkOption { type = lib.types.str; };
      pk = lib.mkOption { type = lib.types.bool; default = false; };
      auto = lib.mkOption { type = lib.types.bool; default = false; };
      required = lib.mkOption { type = lib.types.bool; default = false; };
      unique = lib.mkOption { type = lib.types.bool; default = false; };
      default = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
      references = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
      metadata = lib.mkOption {
        type = fieldMetadataType;
        default = {};
        description = "Presentation, ordering, and privacy metadata for generated outputs.";
      };
      validation = lib.mkOption {
        type = fieldValidationType;
        default = {};
        description = "Per-field validation constraints for generated API schemas and services.";
      };
      relationship = lib.mkOption {
        type = lib.types.nullOr fieldRelationshipType;
        default = null;
        description = "Optional metadata for a foreign-key relationship represented by this column.";
      };
    };
  };

  # Record-level relationship between auth.userId and a resource field.
  relationshipType = lib.types.submodule {
    options = {
      field = lib.mkOption {
        type = fieldRefType;
        description = "Structured field reference implementing this relationship.";
      };
    };
  };

  relationshipSpecType = lib.types.either lib.types.str relationshipType;

  crossFieldValidationType = lib.types.submodule {
    options = {
      fields = lib.mkOption {
        type = lib.types.listOf fieldRefType;
        default = [];
        description = "Structured local field references covered by this constraint.";
      };
      expression = lib.mkOption {
        type = lib.types.attrs;
        description = "Boolean expression AST that must evaluate truthy for a valid record.";
      };
      message = lib.mkOption {
        type = lib.types.str;
        description = "Human-readable validation error shown when the expression fails.";
      };
    };
  };

  ecommerceOptionType = lib.types.submodule {
    options = {
      field = lib.mkOption {
        type = lib.types.nullOr fieldRefType;
        default = null;
        description = "Optional target field this configurable purchase option writes to.";
      };
      type = lib.mkOption {
        type = lib.types.str;
        default = "text";
        description = "UI/input type for this option.";
      };
      label = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Human-readable option label.";
      };
      default = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Default option value.";
      };
      choices = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Allowed user-facing choices, when finite.";
      };
      required = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether this option must be provided.";
      };
      min = lib.mkOption {
        type = lib.types.nullOr lib.types.int;
        default = null;
        description = "Minimum numeric value.";
      };
      max = lib.mkOption {
        type = lib.types.nullOr lib.types.int;
        default = null;
        description = "Maximum numeric value.";
      };
    };
  };

  ecommerceType = lib.types.submodule {
    options = {
      enabled = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Enable generated catalog, cart, checkout, settlement, and order flows.";
      };
      catalog = lib.mkOption {
        type = lib.types.submodule {
          options = {
            entity = lib.mkOption { type = lib.types.str; default = ""; };
            title = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            description = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            price = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            groupBy = lib.mkOption { type = lib.types.listOf fieldRefType; default = []; };
            variantFields = lib.mkOption { type = lib.types.listOf fieldRefType; default = []; };
            availability = lib.mkOption {
              type = lib.types.submodule {
                options = {
                  field = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
                  available = lib.mkOption { type = lib.types.str; default = "available"; };
                };
              };
              default = {};
            };
          };
        };
        default = {};
      };
      order = lib.mkOption {
        type = lib.types.submodule {
          options = {
            entity = lib.mkOption { type = lib.types.str; default = ""; };
            user = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            status = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            amount = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            currency = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            expiresAt = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            paymentReference = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            client = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            pendingStatus = lib.mkOption { type = lib.types.str; default = "checkout_pending"; };
            paidStatus = lib.mkOption { type = lib.types.str; default = "paid"; };
            expiredStatus = lib.mkOption { type = lib.types.str; default = "expired"; };
            cancelledStatus = lib.mkOption { type = lib.types.str; default = "cancelled"; };
          };
        };
        default = {};
      };
      lineItem = lib.mkOption {
        type = lib.types.submodule {
          options = {
            entity = lib.mkOption { type = lib.types.str; default = ""; };
            catalogItem = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            user = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            price = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            status = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            quantity = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            reservedStatus = lib.mkOption { type = lib.types.str; default = "reserved"; };
            fulfilledStatus = lib.mkOption { type = lib.types.str; default = "fulfilled"; };
            cancelledStatus = lib.mkOption { type = lib.types.str; default = "cancelled"; };
            options = lib.mkOption { type = lib.types.attrsOf ecommerceOptionType; default = {}; };
          };
        };
        default = {};
      };
      orderLine = lib.mkOption {
        type = lib.types.submodule {
          options = {
            entity = lib.mkOption { type = lib.types.str; default = ""; };
            order = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            lineItem = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
          };
        };
        default = {};
      };
      transaction = lib.mkOption {
        type = lib.types.submodule {
          options = {
            entity = lib.mkOption { type = lib.types.str; default = ""; };
            user = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            amount = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            type = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            status = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            reference = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            client = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            purchaseType = lib.mkOption { type = lib.types.str; default = "purchase"; };
            pendingStatus = lib.mkOption { type = lib.types.str; default = "pending"; };
            completedStatus = lib.mkOption { type = lib.types.str; default = "completed"; };
            failedStatus = lib.mkOption { type = lib.types.str; default = "failed"; };
          };
        };
        default = {};
      };
      transactionLine = lib.mkOption {
        type = lib.types.submodule {
          options = {
            entity = lib.mkOption { type = lib.types.str; default = ""; };
            transaction = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
            lineItem = lib.mkOption { type = lib.types.nullOr fieldRefType; default = null; };
          };
        };
        default = {};
      };
      checkout = lib.mkOption {
        type = lib.types.submodule {
          options = {
            currency = lib.mkOption { type = lib.types.str; default = "GBP"; };
            expiryMinutes = lib.mkOption { type = lib.types.int; default = 15; };
            maxQuantity = lib.mkOption { type = lib.types.int; default = 20; };
            maxLines = lib.mkOption { type = lib.types.int; default = 50; };
          };
        };
        default = {};
      };
      compatibility = lib.mkOption {
        type = lib.types.submodule {
          options = {
            bookingAliases = lib.mkOption {
              type = lib.types.bool;
              default = false;
              description = "Expose deprecated booking-specific commerce aliases for old clients.";
            };
          };
        };
        default = {};
      };
    };
  };

  indexType = lib.types.submodule {
    options = {
      columns = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        description = "Columns covered by the index, in order.";
      };
      unique = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether this index enforces uniqueness.";
      };
    };
  };

  # Effect types
  effectType = lib.types.submodule {
    options = {
      emit = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
      notify = lib.mkOption {
        type = lib.types.nullOr (lib.types.submodule {
          options = {
            channel = lib.mkOption { type = lib.types.str; };
            template = lib.mkOption { type = lib.types.str; };
            to = lib.mkOption { type = lib.types.str; default = "customer"; };
          };
        });
        default = null;
      };
      call = lib.mkOption {
        type = lib.types.nullOr (lib.types.submodule {
          options = {
            service = lib.mkOption { type = lib.types.str; };
            action = lib.mkOption { type = lib.types.str; };
          };
        });
        default = null;
      };
    };
  };

  # Cascade update
  cascadeType = lib.types.submodule {
    options = {
      entity = lib.mkOption { type = lib.types.str; };
      via = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; };
      set = lib.mkOption { type = lib.types.attrsOf lib.types.str; default = {}; };
    };
  };

  # Operation definition
  workflowTransitionType = lib.types.submodule {
    options = {
      field = lib.mkOption {
        type = fieldRefType;
        description = "State field affected by the transition.";
      };
      from = lib.mkOption {
        type = lib.types.listOf lib.types.str;
        default = [];
        description = "Allowed source values for the transition.";
      };
      to = lib.mkOption {
        type = lib.types.str;
        description = "Target value after the transition.";
      };
    };
  };

  workflowAuditType = lib.types.submodule {
    options = {
      summary = lib.mkOption {
        type = lib.types.str;
        description = "Short audit text for this operation.";
      };
      detail = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Optional longer audit detail template.";
      };
    };
  };

  workflowConfirmationType = lib.types.submodule {
    options = {
      required = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether generated clients should require explicit confirmation.";
      };
      title = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Confirmation dialog title.";
      };
      message = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Confirmation dialog message.";
      };
      confirmLabel = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Confirmation action label.";
      };
      severity = lib.mkOption {
        type = lib.types.enum [ "info" "warning" "danger" ];
        default = "warning";
        description = "Confirmation severity hint.";
      };
    };
  };

  operationWorkflowType = lib.types.submodule {
    options = {
      group = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Workflow group key from workflows.groups.";
      };
      transitions = lib.mkOption {
        type = lib.types.listOf workflowTransitionType;
        default = [];
        description = "Allowed record state transitions performed by this operation.";
      };
      audit = lib.mkOption {
        type = lib.types.nullOr workflowAuditType;
        default = null;
        description = "Audit text metadata for this operation.";
      };
      confirmation = lib.mkOption {
        type = workflowConfirmationType;
        default = {};
        description = "Generated client confirmation requirements.";
      };
    };
  };

  operationPolicyType = lib.types.submodule {
    options = {
      label = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Human-readable operation policy label.";
      };
      description = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Short policy description for generated clients and API docs.";
      };
      audiences = lib.mkOption {
        type = lib.types.listOf audienceType;
        default = [];
        description = "Intended identity audiences. Empty means codegen derives audiences from public and relationship policy.";
      };
      risk = lib.mkOption {
        type = lib.types.enum [ "low" "medium" "high" ];
        default = "medium";
        description = "Operational risk hint for generated clients.";
      };
    };
  };

  operationAuditType = lib.types.submodule {
    options = {
      required = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Whether this specific operation must be audit logged.";
      };
      category = lib.mkOption {
        type = auditCategoryType;
        default = "data";
        description = "Audit category for this operation.";
      };
      reason = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Why this operation requires audit logging.";
      };
    };
  };

  operationType = lib.types.submodule {
    options = {
      guard = lib.mkOption {
        type = lib.types.nullOr lib.types.attrs;  # Expression AST
        default = null;
        description = "Precondition expression (built with lib/expr.nix)";
      };
      relationships = lib.mkOption {
        type = lib.types.nullOr (lib.types.listOf relationshipSpecType);
        default = null;
        description = "Record relationships that permit this operation. Strings resolve by convention to <relationship>_id fields.";
      };
      public = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = "Allow this operation without an authenticated scope.";
      };
      scope = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "Optional permission scope override. Defaults to <entity>.<operation>.";
      };
      policy = lib.mkOption {
        type = operationPolicyType;
        default = {};
        description = "Policy metadata for generated API descriptions and clients.";
      };
      workflow = lib.mkOption {
        type = operationWorkflowType;
        default = {};
        description = "Workflow metadata for generated API descriptions and clients.";
      };
      audit = lib.mkOption {
        type = operationAuditType;
        default = {};
        description = "Audit logging requirement metadata for this operation.";
      };
      set = lib.mkOption {
        type = lib.types.attrsOf lib.types.str;
        default = {};
        description = "Fields to update";
      };
      cascade = lib.mkOption {
        type = lib.types.listOf cascadeType;
        default = [];
        description = "Cascading updates to related entities";
      };
      effects = lib.mkOption {
        type = lib.types.listOf effectType;
        default = [];
        description = "Side effects to trigger";
      };
    };
  };

in {
  options = {
    organization = lib.mkOption {
      type = organizationType;
      default = {};
      description = "Top-level organization or product metadata.";
    };

    auth = lib.mkOption {
      type = authType;
      default = {};
      description = "Authentication role and policy metadata.";
    };

    workflows = lib.mkOption {
      type = workflowsType;
      default = {};
      description = "Workflow group metadata for generated clients.";
    };

    audit = lib.mkOption {
      type = auditType;
      default = {};
      description = "Audit logging requirement metadata.";
    };

    seed = lib.mkOption {
      type = seedType;
      default = {};
      description = "Reference and fixture seed data.";
    };

    integrations = lib.mkOption {
      type = integrationsType;
      default = {};
      description = "System-level external integration configuration metadata.";
    };

    tables = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf columnType);
      default = {};
      description = "Database table definitions";
    };

    derived = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf derivedFieldType);
      default = {};
      description = "Display-only fields derived from stored entity values.";
    };

    refs = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf fieldRefType);
      default = lib.mapAttrs (table: cols:
        lib.mapAttrs (field: col: {
          inherit table field;
          references = col.references;
        }) cols
      ) config.tables;
      description = "Structured references for table fields.";
    };

    relationships = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf relationshipType);
      default = {};
      description = "Record relationship definitions per entity.";
    };

    validations = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf crossFieldValidationType);
      default = {};
      description = "Cross-field validation constraints per entity.";
    };

    indexes = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf indexType);
      default = {};
      description = "Database indexes per table.";
    };

    operations = lib.mkOption {
      type = lib.types.attrsOf (lib.types.attrsOf operationType);
      default = {};
      description = "Operations per entity (e.g., operations.ticket.confirm)";
    };

    ecommerce = lib.mkOption {
      type = ecommerceType;
      default = {};
      description = "Generic catalog/cart/checkout commerce configuration.";
    };
  };
}
