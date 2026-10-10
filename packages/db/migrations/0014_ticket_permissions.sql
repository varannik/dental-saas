-- The permissions behind a voice ticket (V4), so speech on the stream is interpreted with the
-- same tools as typed text by the same clinician.
ALTER TABLE voice.stream_tickets ADD COLUMN permissions text[] NOT NULL DEFAULT '{}';
