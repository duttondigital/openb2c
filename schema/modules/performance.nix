{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.performance = {
    id = { type = "integer"; pk = true; auto = true; };
    title = {
      type = "text";
      required = true;
      metadata = {
        label = "Performance";
        placeholder = "The Magic Flute";
        displayPriority = 10;
      };
      validation.maxLength = 160;
    };
    venue_id = {
      type = "integer";
      required = true;
      references = "venue(id)";
      metadata = {
        label = "Venue";
        displayPriority = 20;
      };
      relationship = {
        label = "Venue";
        description = "Venue hosting this performance.";
        targetLabel = config.refs.venue.name;
      };
    };
    date = {
      type = "text";
      required = true;
      metadata = {
        label = "Date";
        placeholder = "YYYY-MM-DD";
        format = "date";
        displayPriority = 30;
      };
    };
    time = {
      type = "text";
      required = true;
      metadata = {
        label = "Time";
        placeholder = "HH:MM";
        format = "time";
        displayPriority = 40;
      };
    };
    duration_mins = {
      type = "integer";
      required = true;
      metadata = {
        label = "Duration";
        helpText = "Duration in minutes.";
        displayPriority = 50;
      };
      validation = {
        minimum = 1;
        maximum = 600;
      };
    };
    price_pence = {
      type = "integer";
      required = true;
      metadata = {
        label = "Price";
        format = "money";
        displayPriority = 60;
      };
      validation.minimum = 0;
    };
    description = {
      type = "text";
      metadata = {
        label = "Description";
        format = "textarea";
        displayPriority = 70;
      };
    };
    status = {
      type = "text";
      default = "'scheduled'";
      metadata = {
        label = "Status";
        displayPriority = 80;
      };
      validation.enum = [ "scheduled" "cancelled" "completed" ];
    };
    created_at = {
      type = "text";
      default = "CURRENT_TIMESTAMP";
      metadata = {
        label = "Created";
        format = "date-time";
        displayPriority = 1000;
      };
    };
  };

  indexes.performance.by_venue_date = {
    columns = [ "venue_id" "date" ];
  };

  derived.performance.display_title = {
    type = "text";
    metadata = {
      label = "Display title";
      helpText = "Generated display label combining title, date, and time.";
      displayPriority = 15;
    };
    dependencies = [
      config.refs.performance.title
      config.refs.performance.date
      config.refs.performance.time
    ];
    template = "{title} - {date} {time}";
  };

  audit.entities.performance = {
    operations = [ "create" "update" "delete" "cancel" "complete" "reschedule" ];
    category = "workflow";
    reason = "Performance changes affect public catalog state and ticket holder communications.";
  };

  # Junction table for performance artist participation.
  tables.performance_artist = {
    id = { type = "integer"; pk = true; auto = true; };
    performance_id = {
      type = "integer";
      required = true;
      references = "performance(id)";
      relationship = {
        label = "Performance";
        targetLabel = config.refs.performance.title;
      };
    };
    user_id = {
      type = "integer";
      required = true;
      references = "user(id)";
      relationship = {
        label = "Artist";
        targetLabel = config.refs.user.name;
      };
    };
    role_in_performance = { type = "text"; };  # Character name or role
  };

  indexes.performance_artist.unique_pair = {
    columns = [ "performance_id" "user_id" ];
    unique = true;
  };

  workflows.groups.performanceLifecycle = {
    label = "Performance lifecycle";
    description = "Administrative operations for scheduled performances.";
    displayPriority = 10;
  };

  operations.performance = {
    read = {
      public = true;
      policy = {
        label = "Browse performances";
        description = "Public catalog access to scheduled performances.";
        audiences = [ "anonymous" "customer" ];
        risk = "low";
      };
    };

    cancel = {
      audit = {
        required = true;
        category = "workflow";
        reason = "Performance cancellation cascades to ticket state and customer notifications.";
      };
      policy = {
        label = "Cancel performance";
        description = "Administrative operation that cancels a scheduled performance and cascades ticket cancellation.";
        audiences = [ "staff" ];
        risk = "high";
      };
      workflow = {
        group = "performanceLifecycle";
        transitions = [{
          field = config.refs.performance.status;
          from = [ "scheduled" ];
          to = "cancelled";
        }];
        audit.summary = "Cancelled performance";
        audit.detail = "Cancelled the performance and cascaded cancellation to related tickets.";
        confirmation = {
          required = true;
          title = "Cancel performance";
          message = "This will cancel the performance and notify ticket holders.";
          confirmLabel = "Cancel performance";
          severity = "danger";
        };
      };
      guard = E.eq (E.f "status") (E.lit "scheduled");
      set = { status = "cancelled"; };
      cascade = [{
        entity = "ticket";
        via = "performance_id";
        set = { status = "cancelled"; };
      }];
      effects = [
        { notify = { channel = "email"; template = "performance_cancelled"; to = "ticket_holders"; }; }
      ];
    };

    complete = {
      policy = {
        label = "Complete performance";
        audiences = [ "staff" ];
      };
      workflow = {
        group = "performanceLifecycle";
        transitions = [{
          field = config.refs.performance.status;
          from = [ "scheduled" ];
          to = "completed";
        }];
        audit.summary = "Completed performance";
      };
      guard = E.eq (E.f "status") (E.lit "scheduled");
      set = { status = "completed"; };
    };

    reschedule = {
      audit = {
        required = true;
        category = "workflow";
        reason = "Performance rescheduling may notify ticket holders.";
      };
      policy = {
        label = "Reschedule performance";
        audiences = [ "staff" ];
        risk = "high";
      };
      workflow = {
        group = "performanceLifecycle";
        audit.summary = "Rescheduled performance";
        confirmation = {
          required = true;
          title = "Reschedule performance";
          message = "This may notify ticket holders about the changed date or time.";
          confirmLabel = "Reschedule";
          severity = "warning";
        };
      };
      guard = E.eq (E.f "status") (E.lit "scheduled");
      # Note: actual date/time comes from input, not hardcoded
      set = {};  # Fields set from input
      effects = [
        { notify = { channel = "email"; template = "performance_rescheduled"; to = "ticket_holders"; }; }
      ];
    };
  };
  operations.performance_artist.read.public = true;
}
