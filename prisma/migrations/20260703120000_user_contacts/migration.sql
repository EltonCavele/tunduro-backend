CREATE TABLE "user_contacts" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_contacts_ownerUserId_email_key" ON "user_contacts"("ownerUserId", "email");
CREATE INDEX "user_contacts_ownerUserId_deletedAt_idx" ON "user_contacts"("ownerUserId", "deletedAt");

ALTER TABLE "user_contacts" ADD CONSTRAINT "user_contacts_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
