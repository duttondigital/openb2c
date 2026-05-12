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

  # Junction table for performance-artist many-to-many
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
    artist_id = {
      type = "integer";
      required = true;
      references = "artist(id)";
      relationship = {
        label = "Artist";
        targetLabel = config.refs.artist.name;
      };
    };
    role_in_performance = { type = "text"; };  # Character name or role
  };

  indexes.performance_artist.unique_pair = {
    columns = [ "performance_id" "artist_id" ];
    unique = true;
  };

  operations.performance = {
    read.public = true;

    cancel = {
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
      guard = E.eq (E.f "status") (E.lit "scheduled");
      set = { status = "completed"; };
    };

    reschedule = {
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
