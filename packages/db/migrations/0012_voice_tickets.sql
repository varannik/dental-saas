-- Voice stream tickets (V1, spec sections H and L).
--
-- A browser cannot set headers on a WebSocket, so the socket authenticates with a ticket from
-- POST /v1/voice/tickets: single use, 30 seconds, bound to the user, the clinic and the access
-- token that asked for it. Only a SHA-256 of the ticket is stored. A used or expired ticket
-- never opens a socket.

CREATE TABLE voice.stream_tickets (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES core.clinics (id),
  user_id uuid NOT NULL REFERENCES core.users (id),
  token_hash text NOT NULL UNIQUE,
  role text NOT NULL,
  -- The stream closes when the access token behind the ticket expires.
  access_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stream_tickets_lifetime_check CHECK (expires_at > created_at)
);

CREATE INDEX stream_tickets_expiry_idx ON voice.stream_tickets (expires_at);

-- Once used, a ticket stays used.
CREATE FUNCTION voice.ticket_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.id, NEW.clinic_id, NEW.user_id, NEW.token_hash, NEW.role, NEW.access_expires_at,
      NEW.expires_at, NEW.created_at)
       IS DISTINCT FROM
     (OLD.id, OLD.clinic_id, OLD.user_id, OLD.token_hash, OLD.role, OLD.access_expires_at,
      OLD.expires_at, OLD.created_at)
     OR OLD.used_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'a stream ticket is only ever marked used, once'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER stream_tickets_guard BEFORE UPDATE ON voice.stream_tickets
  FOR EACH ROW EXECUTE FUNCTION voice.ticket_guard();

ALTER TABLE voice.stream_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice.stream_tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON voice.stream_tickets
  USING (clinic_id = core.current_clinic_id())
  WITH CHECK (clinic_id = core.current_clinic_id());

GRANT SELECT, INSERT, UPDATE ON voice.stream_tickets TO app;
