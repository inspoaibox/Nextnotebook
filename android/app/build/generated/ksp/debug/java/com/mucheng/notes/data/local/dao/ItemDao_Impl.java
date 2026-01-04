package com.mucheng.notes.data.local.dao;

import android.database.Cursor;
import android.os.CancellationSignal;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.room.CoroutinesRoom;
import androidx.room.EntityInsertionAdapter;
import androidx.room.RoomDatabase;
import androidx.room.RoomSQLiteQuery;
import androidx.room.SharedSQLiteStatement;
import androidx.room.util.CursorUtil;
import androidx.room.util.DBUtil;
import androidx.sqlite.db.SupportSQLiteStatement;
import com.mucheng.notes.data.local.entity.ItemEntity;
import java.lang.Class;
import java.lang.Exception;
import java.lang.Integer;
import java.lang.Long;
import java.lang.Object;
import java.lang.Override;
import java.lang.String;
import java.lang.SuppressWarnings;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import javax.annotation.processing.Generated;
import kotlin.Unit;
import kotlin.coroutines.Continuation;
import kotlinx.coroutines.flow.Flow;

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class ItemDao_Impl implements ItemDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<ItemEntity> __insertionAdapterOfItemEntity;

  private final SharedSQLiteStatement __preparedStmtOfSoftDelete;

  private final SharedSQLiteStatement __preparedStmtOfMarkSynced;

  private final SharedSQLiteStatement __preparedStmtOfUpdateSyncStatus;

  private final SharedSQLiteStatement __preparedStmtOfHardDelete;

  private final SharedSQLiteStatement __preparedStmtOfCleanupDeleted;

  public ItemDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfItemEntity = new EntityInsertionAdapter<ItemEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `items` (`id`,`type`,`created_time`,`updated_time`,`deleted_time`,`payload`,`content_hash`,`sync_status`,`local_rev`,`remote_rev`,`encryption_applied`,`schema_version`) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final ItemEntity entity) {
        statement.bindString(1, entity.getId());
        statement.bindString(2, entity.getType());
        statement.bindLong(3, entity.getCreatedTime());
        statement.bindLong(4, entity.getUpdatedTime());
        if (entity.getDeletedTime() == null) {
          statement.bindNull(5);
        } else {
          statement.bindLong(5, entity.getDeletedTime());
        }
        statement.bindString(6, entity.getPayload());
        statement.bindString(7, entity.getContentHash());
        statement.bindString(8, entity.getSyncStatus());
        statement.bindLong(9, entity.getLocalRev());
        if (entity.getRemoteRev() == null) {
          statement.bindNull(10);
        } else {
          statement.bindString(10, entity.getRemoteRev());
        }
        statement.bindLong(11, entity.getEncryptionApplied());
        statement.bindLong(12, entity.getSchemaVersion());
      }
    };
    this.__preparedStmtOfSoftDelete = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "UPDATE items SET deleted_time = ?, sync_status = 'deleted', local_rev = local_rev + 1 WHERE id = ?";
        return _query;
      }
    };
    this.__preparedStmtOfMarkSynced = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "UPDATE items SET sync_status = 'clean', remote_rev = ? WHERE id = ?";
        return _query;
      }
    };
    this.__preparedStmtOfUpdateSyncStatus = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "UPDATE items SET sync_status = ?, local_rev = local_rev + 1 WHERE id = ?";
        return _query;
      }
    };
    this.__preparedStmtOfHardDelete = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "DELETE FROM items WHERE id = ?";
        return _query;
      }
    };
    this.__preparedStmtOfCleanupDeleted = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "DELETE FROM items WHERE deleted_time IS NOT NULL AND deleted_time < ?";
        return _query;
      }
    };
  }

  @Override
  public Object upsert(final ItemEntity item, final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __insertionAdapterOfItemEntity.insert(item);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object upsertAll(final List<ItemEntity> items,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __insertionAdapterOfItemEntity.insert(items);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object softDelete(final String id, final long time,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfSoftDelete.acquire();
        int _argIndex = 1;
        _stmt.bindLong(_argIndex, time);
        _argIndex = 2;
        _stmt.bindString(_argIndex, id);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfSoftDelete.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object markSynced(final String id, final String remoteRev,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfMarkSynced.acquire();
        int _argIndex = 1;
        _stmt.bindString(_argIndex, remoteRev);
        _argIndex = 2;
        _stmt.bindString(_argIndex, id);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfMarkSynced.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object updateSyncStatus(final String id, final String status,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfUpdateSyncStatus.acquire();
        int _argIndex = 1;
        _stmt.bindString(_argIndex, status);
        _argIndex = 2;
        _stmt.bindString(_argIndex, id);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfUpdateSyncStatus.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object hardDelete(final String id, final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfHardDelete.acquire();
        int _argIndex = 1;
        _stmt.bindString(_argIndex, id);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfHardDelete.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object cleanupDeleted(final long threshold, final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfCleanupDeleted.acquire();
        int _argIndex = 1;
        _stmt.bindLong(_argIndex, threshold);
        try {
          __db.beginTransaction();
          try {
            _stmt.executeUpdateDelete();
            __db.setTransactionSuccessful();
            return Unit.INSTANCE;
          } finally {
            __db.endTransaction();
          }
        } finally {
          __preparedStmtOfCleanupDeleted.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Flow<List<ItemEntity>> getByType(final String type) {
    final String _sql = "SELECT * FROM items WHERE type = ? AND deleted_time IS NULL ORDER BY updated_time DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, type);
    return CoroutinesRoom.createFlow(__db, false, new String[] {"items"}, new Callable<List<ItemEntity>>() {
      @Override
      @NonNull
      public List<ItemEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfType = CursorUtil.getColumnIndexOrThrow(_cursor, "type");
          final int _cursorIndexOfCreatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "created_time");
          final int _cursorIndexOfUpdatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "updated_time");
          final int _cursorIndexOfDeletedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "deleted_time");
          final int _cursorIndexOfPayload = CursorUtil.getColumnIndexOrThrow(_cursor, "payload");
          final int _cursorIndexOfContentHash = CursorUtil.getColumnIndexOrThrow(_cursor, "content_hash");
          final int _cursorIndexOfSyncStatus = CursorUtil.getColumnIndexOrThrow(_cursor, "sync_status");
          final int _cursorIndexOfLocalRev = CursorUtil.getColumnIndexOrThrow(_cursor, "local_rev");
          final int _cursorIndexOfRemoteRev = CursorUtil.getColumnIndexOrThrow(_cursor, "remote_rev");
          final int _cursorIndexOfEncryptionApplied = CursorUtil.getColumnIndexOrThrow(_cursor, "encryption_applied");
          final int _cursorIndexOfSchemaVersion = CursorUtil.getColumnIndexOrThrow(_cursor, "schema_version");
          final List<ItemEntity> _result = new ArrayList<ItemEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final ItemEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpType;
            _tmpType = _cursor.getString(_cursorIndexOfType);
            final long _tmpCreatedTime;
            _tmpCreatedTime = _cursor.getLong(_cursorIndexOfCreatedTime);
            final long _tmpUpdatedTime;
            _tmpUpdatedTime = _cursor.getLong(_cursorIndexOfUpdatedTime);
            final Long _tmpDeletedTime;
            if (_cursor.isNull(_cursorIndexOfDeletedTime)) {
              _tmpDeletedTime = null;
            } else {
              _tmpDeletedTime = _cursor.getLong(_cursorIndexOfDeletedTime);
            }
            final String _tmpPayload;
            _tmpPayload = _cursor.getString(_cursorIndexOfPayload);
            final String _tmpContentHash;
            _tmpContentHash = _cursor.getString(_cursorIndexOfContentHash);
            final String _tmpSyncStatus;
            _tmpSyncStatus = _cursor.getString(_cursorIndexOfSyncStatus);
            final int _tmpLocalRev;
            _tmpLocalRev = _cursor.getInt(_cursorIndexOfLocalRev);
            final String _tmpRemoteRev;
            if (_cursor.isNull(_cursorIndexOfRemoteRev)) {
              _tmpRemoteRev = null;
            } else {
              _tmpRemoteRev = _cursor.getString(_cursorIndexOfRemoteRev);
            }
            final int _tmpEncryptionApplied;
            _tmpEncryptionApplied = _cursor.getInt(_cursorIndexOfEncryptionApplied);
            final int _tmpSchemaVersion;
            _tmpSchemaVersion = _cursor.getInt(_cursorIndexOfSchemaVersion);
            _item = new ItemEntity(_tmpId,_tmpType,_tmpCreatedTime,_tmpUpdatedTime,_tmpDeletedTime,_tmpPayload,_tmpContentHash,_tmpSyncStatus,_tmpLocalRev,_tmpRemoteRev,_tmpEncryptionApplied,_tmpSchemaVersion);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
        }
      }

      @Override
      protected void finalize() {
        _statement.release();
      }
    });
  }

  @Override
  public Object getByTypeOnce(final String type,
      final Continuation<? super List<ItemEntity>> $completion) {
    final String _sql = "SELECT * FROM items WHERE type = ? AND deleted_time IS NULL ORDER BY updated_time DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, type);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<ItemEntity>>() {
      @Override
      @NonNull
      public List<ItemEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfType = CursorUtil.getColumnIndexOrThrow(_cursor, "type");
          final int _cursorIndexOfCreatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "created_time");
          final int _cursorIndexOfUpdatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "updated_time");
          final int _cursorIndexOfDeletedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "deleted_time");
          final int _cursorIndexOfPayload = CursorUtil.getColumnIndexOrThrow(_cursor, "payload");
          final int _cursorIndexOfContentHash = CursorUtil.getColumnIndexOrThrow(_cursor, "content_hash");
          final int _cursorIndexOfSyncStatus = CursorUtil.getColumnIndexOrThrow(_cursor, "sync_status");
          final int _cursorIndexOfLocalRev = CursorUtil.getColumnIndexOrThrow(_cursor, "local_rev");
          final int _cursorIndexOfRemoteRev = CursorUtil.getColumnIndexOrThrow(_cursor, "remote_rev");
          final int _cursorIndexOfEncryptionApplied = CursorUtil.getColumnIndexOrThrow(_cursor, "encryption_applied");
          final int _cursorIndexOfSchemaVersion = CursorUtil.getColumnIndexOrThrow(_cursor, "schema_version");
          final List<ItemEntity> _result = new ArrayList<ItemEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final ItemEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpType;
            _tmpType = _cursor.getString(_cursorIndexOfType);
            final long _tmpCreatedTime;
            _tmpCreatedTime = _cursor.getLong(_cursorIndexOfCreatedTime);
            final long _tmpUpdatedTime;
            _tmpUpdatedTime = _cursor.getLong(_cursorIndexOfUpdatedTime);
            final Long _tmpDeletedTime;
            if (_cursor.isNull(_cursorIndexOfDeletedTime)) {
              _tmpDeletedTime = null;
            } else {
              _tmpDeletedTime = _cursor.getLong(_cursorIndexOfDeletedTime);
            }
            final String _tmpPayload;
            _tmpPayload = _cursor.getString(_cursorIndexOfPayload);
            final String _tmpContentHash;
            _tmpContentHash = _cursor.getString(_cursorIndexOfContentHash);
            final String _tmpSyncStatus;
            _tmpSyncStatus = _cursor.getString(_cursorIndexOfSyncStatus);
            final int _tmpLocalRev;
            _tmpLocalRev = _cursor.getInt(_cursorIndexOfLocalRev);
            final String _tmpRemoteRev;
            if (_cursor.isNull(_cursorIndexOfRemoteRev)) {
              _tmpRemoteRev = null;
            } else {
              _tmpRemoteRev = _cursor.getString(_cursorIndexOfRemoteRev);
            }
            final int _tmpEncryptionApplied;
            _tmpEncryptionApplied = _cursor.getInt(_cursorIndexOfEncryptionApplied);
            final int _tmpSchemaVersion;
            _tmpSchemaVersion = _cursor.getInt(_cursorIndexOfSchemaVersion);
            _item = new ItemEntity(_tmpId,_tmpType,_tmpCreatedTime,_tmpUpdatedTime,_tmpDeletedTime,_tmpPayload,_tmpContentHash,_tmpSyncStatus,_tmpLocalRev,_tmpRemoteRev,_tmpEncryptionApplied,_tmpSchemaVersion);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object getById(final String id, final Continuation<? super ItemEntity> $completion) {
    final String _sql = "SELECT * FROM items WHERE id = ?";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, id);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<ItemEntity>() {
      @Override
      @Nullable
      public ItemEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfType = CursorUtil.getColumnIndexOrThrow(_cursor, "type");
          final int _cursorIndexOfCreatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "created_time");
          final int _cursorIndexOfUpdatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "updated_time");
          final int _cursorIndexOfDeletedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "deleted_time");
          final int _cursorIndexOfPayload = CursorUtil.getColumnIndexOrThrow(_cursor, "payload");
          final int _cursorIndexOfContentHash = CursorUtil.getColumnIndexOrThrow(_cursor, "content_hash");
          final int _cursorIndexOfSyncStatus = CursorUtil.getColumnIndexOrThrow(_cursor, "sync_status");
          final int _cursorIndexOfLocalRev = CursorUtil.getColumnIndexOrThrow(_cursor, "local_rev");
          final int _cursorIndexOfRemoteRev = CursorUtil.getColumnIndexOrThrow(_cursor, "remote_rev");
          final int _cursorIndexOfEncryptionApplied = CursorUtil.getColumnIndexOrThrow(_cursor, "encryption_applied");
          final int _cursorIndexOfSchemaVersion = CursorUtil.getColumnIndexOrThrow(_cursor, "schema_version");
          final ItemEntity _result;
          if (_cursor.moveToFirst()) {
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpType;
            _tmpType = _cursor.getString(_cursorIndexOfType);
            final long _tmpCreatedTime;
            _tmpCreatedTime = _cursor.getLong(_cursorIndexOfCreatedTime);
            final long _tmpUpdatedTime;
            _tmpUpdatedTime = _cursor.getLong(_cursorIndexOfUpdatedTime);
            final Long _tmpDeletedTime;
            if (_cursor.isNull(_cursorIndexOfDeletedTime)) {
              _tmpDeletedTime = null;
            } else {
              _tmpDeletedTime = _cursor.getLong(_cursorIndexOfDeletedTime);
            }
            final String _tmpPayload;
            _tmpPayload = _cursor.getString(_cursorIndexOfPayload);
            final String _tmpContentHash;
            _tmpContentHash = _cursor.getString(_cursorIndexOfContentHash);
            final String _tmpSyncStatus;
            _tmpSyncStatus = _cursor.getString(_cursorIndexOfSyncStatus);
            final int _tmpLocalRev;
            _tmpLocalRev = _cursor.getInt(_cursorIndexOfLocalRev);
            final String _tmpRemoteRev;
            if (_cursor.isNull(_cursorIndexOfRemoteRev)) {
              _tmpRemoteRev = null;
            } else {
              _tmpRemoteRev = _cursor.getString(_cursorIndexOfRemoteRev);
            }
            final int _tmpEncryptionApplied;
            _tmpEncryptionApplied = _cursor.getInt(_cursorIndexOfEncryptionApplied);
            final int _tmpSchemaVersion;
            _tmpSchemaVersion = _cursor.getInt(_cursorIndexOfSchemaVersion);
            _result = new ItemEntity(_tmpId,_tmpType,_tmpCreatedTime,_tmpUpdatedTime,_tmpDeletedTime,_tmpPayload,_tmpContentHash,_tmpSyncStatus,_tmpLocalRev,_tmpRemoteRev,_tmpEncryptionApplied,_tmpSchemaVersion);
          } else {
            _result = null;
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object getByIdNotDeleted(final String id,
      final Continuation<? super ItemEntity> $completion) {
    final String _sql = "SELECT * FROM items WHERE id = ? AND deleted_time IS NULL";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, id);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<ItemEntity>() {
      @Override
      @Nullable
      public ItemEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfType = CursorUtil.getColumnIndexOrThrow(_cursor, "type");
          final int _cursorIndexOfCreatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "created_time");
          final int _cursorIndexOfUpdatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "updated_time");
          final int _cursorIndexOfDeletedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "deleted_time");
          final int _cursorIndexOfPayload = CursorUtil.getColumnIndexOrThrow(_cursor, "payload");
          final int _cursorIndexOfContentHash = CursorUtil.getColumnIndexOrThrow(_cursor, "content_hash");
          final int _cursorIndexOfSyncStatus = CursorUtil.getColumnIndexOrThrow(_cursor, "sync_status");
          final int _cursorIndexOfLocalRev = CursorUtil.getColumnIndexOrThrow(_cursor, "local_rev");
          final int _cursorIndexOfRemoteRev = CursorUtil.getColumnIndexOrThrow(_cursor, "remote_rev");
          final int _cursorIndexOfEncryptionApplied = CursorUtil.getColumnIndexOrThrow(_cursor, "encryption_applied");
          final int _cursorIndexOfSchemaVersion = CursorUtil.getColumnIndexOrThrow(_cursor, "schema_version");
          final ItemEntity _result;
          if (_cursor.moveToFirst()) {
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpType;
            _tmpType = _cursor.getString(_cursorIndexOfType);
            final long _tmpCreatedTime;
            _tmpCreatedTime = _cursor.getLong(_cursorIndexOfCreatedTime);
            final long _tmpUpdatedTime;
            _tmpUpdatedTime = _cursor.getLong(_cursorIndexOfUpdatedTime);
            final Long _tmpDeletedTime;
            if (_cursor.isNull(_cursorIndexOfDeletedTime)) {
              _tmpDeletedTime = null;
            } else {
              _tmpDeletedTime = _cursor.getLong(_cursorIndexOfDeletedTime);
            }
            final String _tmpPayload;
            _tmpPayload = _cursor.getString(_cursorIndexOfPayload);
            final String _tmpContentHash;
            _tmpContentHash = _cursor.getString(_cursorIndexOfContentHash);
            final String _tmpSyncStatus;
            _tmpSyncStatus = _cursor.getString(_cursorIndexOfSyncStatus);
            final int _tmpLocalRev;
            _tmpLocalRev = _cursor.getInt(_cursorIndexOfLocalRev);
            final String _tmpRemoteRev;
            if (_cursor.isNull(_cursorIndexOfRemoteRev)) {
              _tmpRemoteRev = null;
            } else {
              _tmpRemoteRev = _cursor.getString(_cursorIndexOfRemoteRev);
            }
            final int _tmpEncryptionApplied;
            _tmpEncryptionApplied = _cursor.getInt(_cursorIndexOfEncryptionApplied);
            final int _tmpSchemaVersion;
            _tmpSchemaVersion = _cursor.getInt(_cursorIndexOfSchemaVersion);
            _result = new ItemEntity(_tmpId,_tmpType,_tmpCreatedTime,_tmpUpdatedTime,_tmpDeletedTime,_tmpPayload,_tmpContentHash,_tmpSyncStatus,_tmpLocalRev,_tmpRemoteRev,_tmpEncryptionApplied,_tmpSchemaVersion);
          } else {
            _result = null;
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object getPendingSync(final Continuation<? super List<ItemEntity>> $completion) {
    final String _sql = "SELECT * FROM items WHERE sync_status IN ('modified', 'deleted')";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<ItemEntity>>() {
      @Override
      @NonNull
      public List<ItemEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfType = CursorUtil.getColumnIndexOrThrow(_cursor, "type");
          final int _cursorIndexOfCreatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "created_time");
          final int _cursorIndexOfUpdatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "updated_time");
          final int _cursorIndexOfDeletedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "deleted_time");
          final int _cursorIndexOfPayload = CursorUtil.getColumnIndexOrThrow(_cursor, "payload");
          final int _cursorIndexOfContentHash = CursorUtil.getColumnIndexOrThrow(_cursor, "content_hash");
          final int _cursorIndexOfSyncStatus = CursorUtil.getColumnIndexOrThrow(_cursor, "sync_status");
          final int _cursorIndexOfLocalRev = CursorUtil.getColumnIndexOrThrow(_cursor, "local_rev");
          final int _cursorIndexOfRemoteRev = CursorUtil.getColumnIndexOrThrow(_cursor, "remote_rev");
          final int _cursorIndexOfEncryptionApplied = CursorUtil.getColumnIndexOrThrow(_cursor, "encryption_applied");
          final int _cursorIndexOfSchemaVersion = CursorUtil.getColumnIndexOrThrow(_cursor, "schema_version");
          final List<ItemEntity> _result = new ArrayList<ItemEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final ItemEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpType;
            _tmpType = _cursor.getString(_cursorIndexOfType);
            final long _tmpCreatedTime;
            _tmpCreatedTime = _cursor.getLong(_cursorIndexOfCreatedTime);
            final long _tmpUpdatedTime;
            _tmpUpdatedTime = _cursor.getLong(_cursorIndexOfUpdatedTime);
            final Long _tmpDeletedTime;
            if (_cursor.isNull(_cursorIndexOfDeletedTime)) {
              _tmpDeletedTime = null;
            } else {
              _tmpDeletedTime = _cursor.getLong(_cursorIndexOfDeletedTime);
            }
            final String _tmpPayload;
            _tmpPayload = _cursor.getString(_cursorIndexOfPayload);
            final String _tmpContentHash;
            _tmpContentHash = _cursor.getString(_cursorIndexOfContentHash);
            final String _tmpSyncStatus;
            _tmpSyncStatus = _cursor.getString(_cursorIndexOfSyncStatus);
            final int _tmpLocalRev;
            _tmpLocalRev = _cursor.getInt(_cursorIndexOfLocalRev);
            final String _tmpRemoteRev;
            if (_cursor.isNull(_cursorIndexOfRemoteRev)) {
              _tmpRemoteRev = null;
            } else {
              _tmpRemoteRev = _cursor.getString(_cursorIndexOfRemoteRev);
            }
            final int _tmpEncryptionApplied;
            _tmpEncryptionApplied = _cursor.getInt(_cursorIndexOfEncryptionApplied);
            final int _tmpSchemaVersion;
            _tmpSchemaVersion = _cursor.getInt(_cursorIndexOfSchemaVersion);
            _item = new ItemEntity(_tmpId,_tmpType,_tmpCreatedTime,_tmpUpdatedTime,_tmpDeletedTime,_tmpPayload,_tmpContentHash,_tmpSyncStatus,_tmpLocalRev,_tmpRemoteRev,_tmpEncryptionApplied,_tmpSchemaVersion);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object getAll(final Continuation<? super List<ItemEntity>> $completion) {
    final String _sql = "SELECT * FROM items ORDER BY updated_time DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<ItemEntity>>() {
      @Override
      @NonNull
      public List<ItemEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfType = CursorUtil.getColumnIndexOrThrow(_cursor, "type");
          final int _cursorIndexOfCreatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "created_time");
          final int _cursorIndexOfUpdatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "updated_time");
          final int _cursorIndexOfDeletedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "deleted_time");
          final int _cursorIndexOfPayload = CursorUtil.getColumnIndexOrThrow(_cursor, "payload");
          final int _cursorIndexOfContentHash = CursorUtil.getColumnIndexOrThrow(_cursor, "content_hash");
          final int _cursorIndexOfSyncStatus = CursorUtil.getColumnIndexOrThrow(_cursor, "sync_status");
          final int _cursorIndexOfLocalRev = CursorUtil.getColumnIndexOrThrow(_cursor, "local_rev");
          final int _cursorIndexOfRemoteRev = CursorUtil.getColumnIndexOrThrow(_cursor, "remote_rev");
          final int _cursorIndexOfEncryptionApplied = CursorUtil.getColumnIndexOrThrow(_cursor, "encryption_applied");
          final int _cursorIndexOfSchemaVersion = CursorUtil.getColumnIndexOrThrow(_cursor, "schema_version");
          final List<ItemEntity> _result = new ArrayList<ItemEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final ItemEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpType;
            _tmpType = _cursor.getString(_cursorIndexOfType);
            final long _tmpCreatedTime;
            _tmpCreatedTime = _cursor.getLong(_cursorIndexOfCreatedTime);
            final long _tmpUpdatedTime;
            _tmpUpdatedTime = _cursor.getLong(_cursorIndexOfUpdatedTime);
            final Long _tmpDeletedTime;
            if (_cursor.isNull(_cursorIndexOfDeletedTime)) {
              _tmpDeletedTime = null;
            } else {
              _tmpDeletedTime = _cursor.getLong(_cursorIndexOfDeletedTime);
            }
            final String _tmpPayload;
            _tmpPayload = _cursor.getString(_cursorIndexOfPayload);
            final String _tmpContentHash;
            _tmpContentHash = _cursor.getString(_cursorIndexOfContentHash);
            final String _tmpSyncStatus;
            _tmpSyncStatus = _cursor.getString(_cursorIndexOfSyncStatus);
            final int _tmpLocalRev;
            _tmpLocalRev = _cursor.getInt(_cursorIndexOfLocalRev);
            final String _tmpRemoteRev;
            if (_cursor.isNull(_cursorIndexOfRemoteRev)) {
              _tmpRemoteRev = null;
            } else {
              _tmpRemoteRev = _cursor.getString(_cursorIndexOfRemoteRev);
            }
            final int _tmpEncryptionApplied;
            _tmpEncryptionApplied = _cursor.getInt(_cursorIndexOfEncryptionApplied);
            final int _tmpSchemaVersion;
            _tmpSchemaVersion = _cursor.getInt(_cursorIndexOfSchemaVersion);
            _item = new ItemEntity(_tmpId,_tmpType,_tmpCreatedTime,_tmpUpdatedTime,_tmpDeletedTime,_tmpPayload,_tmpContentHash,_tmpSyncStatus,_tmpLocalRev,_tmpRemoteRev,_tmpEncryptionApplied,_tmpSchemaVersion);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object search(final String query, final String type,
      final Continuation<? super List<ItemEntity>> $completion) {
    final String _sql = "SELECT * FROM items WHERE type = ? AND deleted_time IS NULL AND payload LIKE '%' || ? || '%' ORDER BY updated_time DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 2);
    int _argIndex = 1;
    _statement.bindString(_argIndex, type);
    _argIndex = 2;
    _statement.bindString(_argIndex, query);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<ItemEntity>>() {
      @Override
      @NonNull
      public List<ItemEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfType = CursorUtil.getColumnIndexOrThrow(_cursor, "type");
          final int _cursorIndexOfCreatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "created_time");
          final int _cursorIndexOfUpdatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "updated_time");
          final int _cursorIndexOfDeletedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "deleted_time");
          final int _cursorIndexOfPayload = CursorUtil.getColumnIndexOrThrow(_cursor, "payload");
          final int _cursorIndexOfContentHash = CursorUtil.getColumnIndexOrThrow(_cursor, "content_hash");
          final int _cursorIndexOfSyncStatus = CursorUtil.getColumnIndexOrThrow(_cursor, "sync_status");
          final int _cursorIndexOfLocalRev = CursorUtil.getColumnIndexOrThrow(_cursor, "local_rev");
          final int _cursorIndexOfRemoteRev = CursorUtil.getColumnIndexOrThrow(_cursor, "remote_rev");
          final int _cursorIndexOfEncryptionApplied = CursorUtil.getColumnIndexOrThrow(_cursor, "encryption_applied");
          final int _cursorIndexOfSchemaVersion = CursorUtil.getColumnIndexOrThrow(_cursor, "schema_version");
          final List<ItemEntity> _result = new ArrayList<ItemEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final ItemEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpType;
            _tmpType = _cursor.getString(_cursorIndexOfType);
            final long _tmpCreatedTime;
            _tmpCreatedTime = _cursor.getLong(_cursorIndexOfCreatedTime);
            final long _tmpUpdatedTime;
            _tmpUpdatedTime = _cursor.getLong(_cursorIndexOfUpdatedTime);
            final Long _tmpDeletedTime;
            if (_cursor.isNull(_cursorIndexOfDeletedTime)) {
              _tmpDeletedTime = null;
            } else {
              _tmpDeletedTime = _cursor.getLong(_cursorIndexOfDeletedTime);
            }
            final String _tmpPayload;
            _tmpPayload = _cursor.getString(_cursorIndexOfPayload);
            final String _tmpContentHash;
            _tmpContentHash = _cursor.getString(_cursorIndexOfContentHash);
            final String _tmpSyncStatus;
            _tmpSyncStatus = _cursor.getString(_cursorIndexOfSyncStatus);
            final int _tmpLocalRev;
            _tmpLocalRev = _cursor.getInt(_cursorIndexOfLocalRev);
            final String _tmpRemoteRev;
            if (_cursor.isNull(_cursorIndexOfRemoteRev)) {
              _tmpRemoteRev = null;
            } else {
              _tmpRemoteRev = _cursor.getString(_cursorIndexOfRemoteRev);
            }
            final int _tmpEncryptionApplied;
            _tmpEncryptionApplied = _cursor.getInt(_cursorIndexOfEncryptionApplied);
            final int _tmpSchemaVersion;
            _tmpSchemaVersion = _cursor.getInt(_cursorIndexOfSchemaVersion);
            _item = new ItemEntity(_tmpId,_tmpType,_tmpCreatedTime,_tmpUpdatedTime,_tmpDeletedTime,_tmpPayload,_tmpContentHash,_tmpSyncStatus,_tmpLocalRev,_tmpRemoteRev,_tmpEncryptionApplied,_tmpSchemaVersion);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object searchAll(final String query,
      final Continuation<? super List<ItemEntity>> $completion) {
    final String _sql = "SELECT * FROM items WHERE deleted_time IS NULL AND payload LIKE '%' || ? || '%' ORDER BY updated_time DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, query);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<ItemEntity>>() {
      @Override
      @NonNull
      public List<ItemEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfType = CursorUtil.getColumnIndexOrThrow(_cursor, "type");
          final int _cursorIndexOfCreatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "created_time");
          final int _cursorIndexOfUpdatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "updated_time");
          final int _cursorIndexOfDeletedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "deleted_time");
          final int _cursorIndexOfPayload = CursorUtil.getColumnIndexOrThrow(_cursor, "payload");
          final int _cursorIndexOfContentHash = CursorUtil.getColumnIndexOrThrow(_cursor, "content_hash");
          final int _cursorIndexOfSyncStatus = CursorUtil.getColumnIndexOrThrow(_cursor, "sync_status");
          final int _cursorIndexOfLocalRev = CursorUtil.getColumnIndexOrThrow(_cursor, "local_rev");
          final int _cursorIndexOfRemoteRev = CursorUtil.getColumnIndexOrThrow(_cursor, "remote_rev");
          final int _cursorIndexOfEncryptionApplied = CursorUtil.getColumnIndexOrThrow(_cursor, "encryption_applied");
          final int _cursorIndexOfSchemaVersion = CursorUtil.getColumnIndexOrThrow(_cursor, "schema_version");
          final List<ItemEntity> _result = new ArrayList<ItemEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final ItemEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpType;
            _tmpType = _cursor.getString(_cursorIndexOfType);
            final long _tmpCreatedTime;
            _tmpCreatedTime = _cursor.getLong(_cursorIndexOfCreatedTime);
            final long _tmpUpdatedTime;
            _tmpUpdatedTime = _cursor.getLong(_cursorIndexOfUpdatedTime);
            final Long _tmpDeletedTime;
            if (_cursor.isNull(_cursorIndexOfDeletedTime)) {
              _tmpDeletedTime = null;
            } else {
              _tmpDeletedTime = _cursor.getLong(_cursorIndexOfDeletedTime);
            }
            final String _tmpPayload;
            _tmpPayload = _cursor.getString(_cursorIndexOfPayload);
            final String _tmpContentHash;
            _tmpContentHash = _cursor.getString(_cursorIndexOfContentHash);
            final String _tmpSyncStatus;
            _tmpSyncStatus = _cursor.getString(_cursorIndexOfSyncStatus);
            final int _tmpLocalRev;
            _tmpLocalRev = _cursor.getInt(_cursorIndexOfLocalRev);
            final String _tmpRemoteRev;
            if (_cursor.isNull(_cursorIndexOfRemoteRev)) {
              _tmpRemoteRev = null;
            } else {
              _tmpRemoteRev = _cursor.getString(_cursorIndexOfRemoteRev);
            }
            final int _tmpEncryptionApplied;
            _tmpEncryptionApplied = _cursor.getInt(_cursorIndexOfEncryptionApplied);
            final int _tmpSchemaVersion;
            _tmpSchemaVersion = _cursor.getInt(_cursorIndexOfSchemaVersion);
            _item = new ItemEntity(_tmpId,_tmpType,_tmpCreatedTime,_tmpUpdatedTime,_tmpDeletedTime,_tmpPayload,_tmpContentHash,_tmpSyncStatus,_tmpLocalRev,_tmpRemoteRev,_tmpEncryptionApplied,_tmpSchemaVersion);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object getByFolderId(final String type, final String folderId,
      final Continuation<? super List<ItemEntity>> $completion) {
    final String _sql = "SELECT * FROM items WHERE type = ? AND deleted_time IS NULL AND payload LIKE '%\"folder_id\":\"' || ? || '\"%' ORDER BY updated_time DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 2);
    int _argIndex = 1;
    _statement.bindString(_argIndex, type);
    _argIndex = 2;
    _statement.bindString(_argIndex, folderId);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<ItemEntity>>() {
      @Override
      @NonNull
      public List<ItemEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfType = CursorUtil.getColumnIndexOrThrow(_cursor, "type");
          final int _cursorIndexOfCreatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "created_time");
          final int _cursorIndexOfUpdatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "updated_time");
          final int _cursorIndexOfDeletedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "deleted_time");
          final int _cursorIndexOfPayload = CursorUtil.getColumnIndexOrThrow(_cursor, "payload");
          final int _cursorIndexOfContentHash = CursorUtil.getColumnIndexOrThrow(_cursor, "content_hash");
          final int _cursorIndexOfSyncStatus = CursorUtil.getColumnIndexOrThrow(_cursor, "sync_status");
          final int _cursorIndexOfLocalRev = CursorUtil.getColumnIndexOrThrow(_cursor, "local_rev");
          final int _cursorIndexOfRemoteRev = CursorUtil.getColumnIndexOrThrow(_cursor, "remote_rev");
          final int _cursorIndexOfEncryptionApplied = CursorUtil.getColumnIndexOrThrow(_cursor, "encryption_applied");
          final int _cursorIndexOfSchemaVersion = CursorUtil.getColumnIndexOrThrow(_cursor, "schema_version");
          final List<ItemEntity> _result = new ArrayList<ItemEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final ItemEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpType;
            _tmpType = _cursor.getString(_cursorIndexOfType);
            final long _tmpCreatedTime;
            _tmpCreatedTime = _cursor.getLong(_cursorIndexOfCreatedTime);
            final long _tmpUpdatedTime;
            _tmpUpdatedTime = _cursor.getLong(_cursorIndexOfUpdatedTime);
            final Long _tmpDeletedTime;
            if (_cursor.isNull(_cursorIndexOfDeletedTime)) {
              _tmpDeletedTime = null;
            } else {
              _tmpDeletedTime = _cursor.getLong(_cursorIndexOfDeletedTime);
            }
            final String _tmpPayload;
            _tmpPayload = _cursor.getString(_cursorIndexOfPayload);
            final String _tmpContentHash;
            _tmpContentHash = _cursor.getString(_cursorIndexOfContentHash);
            final String _tmpSyncStatus;
            _tmpSyncStatus = _cursor.getString(_cursorIndexOfSyncStatus);
            final int _tmpLocalRev;
            _tmpLocalRev = _cursor.getInt(_cursorIndexOfLocalRev);
            final String _tmpRemoteRev;
            if (_cursor.isNull(_cursorIndexOfRemoteRev)) {
              _tmpRemoteRev = null;
            } else {
              _tmpRemoteRev = _cursor.getString(_cursorIndexOfRemoteRev);
            }
            final int _tmpEncryptionApplied;
            _tmpEncryptionApplied = _cursor.getInt(_cursorIndexOfEncryptionApplied);
            final int _tmpSchemaVersion;
            _tmpSchemaVersion = _cursor.getInt(_cursorIndexOfSchemaVersion);
            _item = new ItemEntity(_tmpId,_tmpType,_tmpCreatedTime,_tmpUpdatedTime,_tmpDeletedTime,_tmpPayload,_tmpContentHash,_tmpSyncStatus,_tmpLocalRev,_tmpRemoteRev,_tmpEncryptionApplied,_tmpSchemaVersion);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object getRootItems(final String type,
      final Continuation<? super List<ItemEntity>> $completion) {
    final String _sql = "SELECT * FROM items WHERE type = ? AND deleted_time IS NULL AND (payload LIKE '%\"folder_id\":null%' OR payload NOT LIKE '%\"folder_id\":%') ORDER BY updated_time DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, type);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<ItemEntity>>() {
      @Override
      @NonNull
      public List<ItemEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfType = CursorUtil.getColumnIndexOrThrow(_cursor, "type");
          final int _cursorIndexOfCreatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "created_time");
          final int _cursorIndexOfUpdatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "updated_time");
          final int _cursorIndexOfDeletedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "deleted_time");
          final int _cursorIndexOfPayload = CursorUtil.getColumnIndexOrThrow(_cursor, "payload");
          final int _cursorIndexOfContentHash = CursorUtil.getColumnIndexOrThrow(_cursor, "content_hash");
          final int _cursorIndexOfSyncStatus = CursorUtil.getColumnIndexOrThrow(_cursor, "sync_status");
          final int _cursorIndexOfLocalRev = CursorUtil.getColumnIndexOrThrow(_cursor, "local_rev");
          final int _cursorIndexOfRemoteRev = CursorUtil.getColumnIndexOrThrow(_cursor, "remote_rev");
          final int _cursorIndexOfEncryptionApplied = CursorUtil.getColumnIndexOrThrow(_cursor, "encryption_applied");
          final int _cursorIndexOfSchemaVersion = CursorUtil.getColumnIndexOrThrow(_cursor, "schema_version");
          final List<ItemEntity> _result = new ArrayList<ItemEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final ItemEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpType;
            _tmpType = _cursor.getString(_cursorIndexOfType);
            final long _tmpCreatedTime;
            _tmpCreatedTime = _cursor.getLong(_cursorIndexOfCreatedTime);
            final long _tmpUpdatedTime;
            _tmpUpdatedTime = _cursor.getLong(_cursorIndexOfUpdatedTime);
            final Long _tmpDeletedTime;
            if (_cursor.isNull(_cursorIndexOfDeletedTime)) {
              _tmpDeletedTime = null;
            } else {
              _tmpDeletedTime = _cursor.getLong(_cursorIndexOfDeletedTime);
            }
            final String _tmpPayload;
            _tmpPayload = _cursor.getString(_cursorIndexOfPayload);
            final String _tmpContentHash;
            _tmpContentHash = _cursor.getString(_cursorIndexOfContentHash);
            final String _tmpSyncStatus;
            _tmpSyncStatus = _cursor.getString(_cursorIndexOfSyncStatus);
            final int _tmpLocalRev;
            _tmpLocalRev = _cursor.getInt(_cursorIndexOfLocalRev);
            final String _tmpRemoteRev;
            if (_cursor.isNull(_cursorIndexOfRemoteRev)) {
              _tmpRemoteRev = null;
            } else {
              _tmpRemoteRev = _cursor.getString(_cursorIndexOfRemoteRev);
            }
            final int _tmpEncryptionApplied;
            _tmpEncryptionApplied = _cursor.getInt(_cursorIndexOfEncryptionApplied);
            final int _tmpSchemaVersion;
            _tmpSchemaVersion = _cursor.getInt(_cursorIndexOfSchemaVersion);
            _item = new ItemEntity(_tmpId,_tmpType,_tmpCreatedTime,_tmpUpdatedTime,_tmpDeletedTime,_tmpPayload,_tmpContentHash,_tmpSyncStatus,_tmpLocalRev,_tmpRemoteRev,_tmpEncryptionApplied,_tmpSchemaVersion);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object getUpdatedSince(final long since,
      final Continuation<? super List<ItemEntity>> $completion) {
    final String _sql = "SELECT * FROM items WHERE updated_time > ? ORDER BY updated_time ASC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindLong(_argIndex, since);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<ItemEntity>>() {
      @Override
      @NonNull
      public List<ItemEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfId = CursorUtil.getColumnIndexOrThrow(_cursor, "id");
          final int _cursorIndexOfType = CursorUtil.getColumnIndexOrThrow(_cursor, "type");
          final int _cursorIndexOfCreatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "created_time");
          final int _cursorIndexOfUpdatedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "updated_time");
          final int _cursorIndexOfDeletedTime = CursorUtil.getColumnIndexOrThrow(_cursor, "deleted_time");
          final int _cursorIndexOfPayload = CursorUtil.getColumnIndexOrThrow(_cursor, "payload");
          final int _cursorIndexOfContentHash = CursorUtil.getColumnIndexOrThrow(_cursor, "content_hash");
          final int _cursorIndexOfSyncStatus = CursorUtil.getColumnIndexOrThrow(_cursor, "sync_status");
          final int _cursorIndexOfLocalRev = CursorUtil.getColumnIndexOrThrow(_cursor, "local_rev");
          final int _cursorIndexOfRemoteRev = CursorUtil.getColumnIndexOrThrow(_cursor, "remote_rev");
          final int _cursorIndexOfEncryptionApplied = CursorUtil.getColumnIndexOrThrow(_cursor, "encryption_applied");
          final int _cursorIndexOfSchemaVersion = CursorUtil.getColumnIndexOrThrow(_cursor, "schema_version");
          final List<ItemEntity> _result = new ArrayList<ItemEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final ItemEntity _item;
            final String _tmpId;
            _tmpId = _cursor.getString(_cursorIndexOfId);
            final String _tmpType;
            _tmpType = _cursor.getString(_cursorIndexOfType);
            final long _tmpCreatedTime;
            _tmpCreatedTime = _cursor.getLong(_cursorIndexOfCreatedTime);
            final long _tmpUpdatedTime;
            _tmpUpdatedTime = _cursor.getLong(_cursorIndexOfUpdatedTime);
            final Long _tmpDeletedTime;
            if (_cursor.isNull(_cursorIndexOfDeletedTime)) {
              _tmpDeletedTime = null;
            } else {
              _tmpDeletedTime = _cursor.getLong(_cursorIndexOfDeletedTime);
            }
            final String _tmpPayload;
            _tmpPayload = _cursor.getString(_cursorIndexOfPayload);
            final String _tmpContentHash;
            _tmpContentHash = _cursor.getString(_cursorIndexOfContentHash);
            final String _tmpSyncStatus;
            _tmpSyncStatus = _cursor.getString(_cursorIndexOfSyncStatus);
            final int _tmpLocalRev;
            _tmpLocalRev = _cursor.getInt(_cursorIndexOfLocalRev);
            final String _tmpRemoteRev;
            if (_cursor.isNull(_cursorIndexOfRemoteRev)) {
              _tmpRemoteRev = null;
            } else {
              _tmpRemoteRev = _cursor.getString(_cursorIndexOfRemoteRev);
            }
            final int _tmpEncryptionApplied;
            _tmpEncryptionApplied = _cursor.getInt(_cursorIndexOfEncryptionApplied);
            final int _tmpSchemaVersion;
            _tmpSchemaVersion = _cursor.getInt(_cursorIndexOfSchemaVersion);
            _item = new ItemEntity(_tmpId,_tmpType,_tmpCreatedTime,_tmpUpdatedTime,_tmpDeletedTime,_tmpPayload,_tmpContentHash,_tmpSyncStatus,_tmpLocalRev,_tmpRemoteRev,_tmpEncryptionApplied,_tmpSchemaVersion);
            _result.add(_item);
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @Override
  public Object countByType(final String type, final Continuation<? super Integer> $completion) {
    final String _sql = "SELECT COUNT(*) FROM items WHERE type = ? AND deleted_time IS NULL";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, type);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<Integer>() {
      @Override
      @NonNull
      public Integer call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final Integer _result;
          if (_cursor.moveToFirst()) {
            final int _tmp;
            _tmp = _cursor.getInt(0);
            _result = _tmp;
          } else {
            _result = 0;
          }
          return _result;
        } finally {
          _cursor.close();
          _statement.release();
        }
      }
    }, $completion);
  }

  @NonNull
  public static List<Class<?>> getRequiredConverters() {
    return Collections.emptyList();
  }
}
