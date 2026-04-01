ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_seriesId_fkey";

ALTER TABLE "bookings" DROP COLUMN IF EXISTS "seriesId";

DROP TABLE IF EXISTS "open_game_join_requests";
DROP TABLE IF EXISTS "open_games";
DROP TABLE IF EXISTS "overtime_requests";
DROP TABLE IF EXISTS "booking_series";

DROP TYPE IF EXISTS "OpenGameJoinStatus";
DROP TYPE IF EXISTS "OpenGameStatus";
DROP TYPE IF EXISTS "OvertimeStatus";
