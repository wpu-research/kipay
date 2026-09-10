-- Panel içi sohbet: kanallar, kişiye özel mesaj, işlem bazlı sohbet, ekler
CREATE TYPE "chat_conversation_type" AS ENUM ('channel', 'direct', 'transaction');

CREATE TABLE "chat_conversations" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"       uuid NOT NULL REFERENCES "tenants"("id"),
  "type"            "chat_conversation_type" NOT NULL,
  "name"            text,
  "is_private"      boolean NOT NULL DEFAULT false,
  "transaction_id"  uuid REFERENCES "transactions"("id") ON DELETE CASCADE,
  "direct_key"      text,
  "created_by"      uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "last_message_at" timestamptz,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "chat_conversations_transaction_unique" ON "chat_conversations" ("transaction_id") WHERE "transaction_id" IS NOT NULL;
CREATE UNIQUE INDEX "chat_conversations_direct_unique"      ON "chat_conversations" ("tenant_id", "direct_key") WHERE "direct_key" IS NOT NULL;
CREATE UNIQUE INDEX "chat_conversations_channel_name_unique" ON "chat_conversations" ("tenant_id", lower("name")) WHERE "type" = 'channel';
CREATE INDEX "chat_conversations_tenant_idx" ON "chat_conversations" ("tenant_id", "last_message_at" DESC);

CREATE TABLE "chat_members" (
  "conversation_id" uuid NOT NULL REFERENCES "chat_conversations"("id") ON DELETE CASCADE,
  "user_id"         uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "last_read_at"    timestamptz,
  "muted"           boolean NOT NULL DEFAULT false,
  "joined_at"       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("conversation_id", "user_id")
);
CREATE INDEX "chat_members_user_idx" ON "chat_members" ("user_id");

CREATE TABLE "chat_messages" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "chat_conversations"("id") ON DELETE CASCADE,
  "sender_id"       uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "content"         text NOT NULL DEFAULT '',
  "attachments"     jsonb NOT NULL DEFAULT '[]'::jsonb,
  "reply_to_id"     uuid REFERENCES "chat_messages"("id") ON DELETE SET NULL,
  "is_system"       boolean NOT NULL DEFAULT false,
  "edited_at"       timestamptz,
  "deleted_at"      timestamptz,
  "created_at"      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "chat_messages_conv_created_idx" ON "chat_messages" ("conversation_id", "created_at" DESC);

CREATE TABLE "chat_attachments" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id"),
  "uploader_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "message_id"  uuid REFERENCES "chat_messages"("id") ON DELETE CASCADE,
  "name"        text NOT NULL,
  "mime"        text NOT NULL,
  "size"        integer NOT NULL,
  "data"        bytea NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "chat_attachments_message_idx" ON "chat_attachments" ("message_id");
