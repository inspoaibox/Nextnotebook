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
import com.mucheng.notes.data.local.entity.ResourceCacheEntity;
import java.lang.Class;
import java.lang.Exception;
import java.lang.Integer;
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

@Generated("androidx.room.RoomProcessor")
@SuppressWarnings({"unchecked", "deprecation"})
public final class ResourceCacheDao_Impl implements ResourceCacheDao {
  private final RoomDatabase __db;

  private final EntityInsertionAdapter<ResourceCacheEntity> __insertionAdapterOfResourceCacheEntity;

  private final SharedSQLiteStatement __preparedStmtOfDelete;

  private final SharedSQLiteStatement __preparedStmtOfDeleteOlderThan;

  public ResourceCacheDao_Impl(@NonNull final RoomDatabase __db) {
    this.__db = __db;
    this.__insertionAdapterOfResourceCacheEntity = new EntityInsertionAdapter<ResourceCacheEntity>(__db) {
      @Override
      @NonNull
      protected String createQuery() {
        return "INSERT OR REPLACE INTO `resource_cache` (`resource_id`,`local_path`,`downloaded_at`,`last_accessed_at`) VALUES (?,?,?,?)";
      }

      @Override
      protected void bind(@NonNull final SupportSQLiteStatement statement,
          @NonNull final ResourceCacheEntity entity) {
        statement.bindString(1, entity.getResourceId());
        statement.bindString(2, entity.getLocalPath());
        statement.bindLong(3, entity.getDownloadedAt());
        statement.bindLong(4, entity.getLastAccessedAt());
      }
    };
    this.__preparedStmtOfDelete = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "DELETE FROM resource_cache WHERE resource_id = ?";
        return _query;
      }
    };
    this.__preparedStmtOfDeleteOlderThan = new SharedSQLiteStatement(__db) {
      @Override
      @NonNull
      public String createQuery() {
        final String _query = "DELETE FROM resource_cache WHERE last_accessed_at < ?";
        return _query;
      }
    };
  }

  @Override
  public Object upsert(final ResourceCacheEntity cache,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        __db.beginTransaction();
        try {
          __insertionAdapterOfResourceCacheEntity.insert(cache);
          __db.setTransactionSuccessful();
          return Unit.INSTANCE;
        } finally {
          __db.endTransaction();
        }
      }
    }, $completion);
  }

  @Override
  public Object delete(final String resourceId, final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfDelete.acquire();
        int _argIndex = 1;
        _stmt.bindString(_argIndex, resourceId);
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
          __preparedStmtOfDelete.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object deleteOlderThan(final long threshold,
      final Continuation<? super Unit> $completion) {
    return CoroutinesRoom.execute(__db, true, new Callable<Unit>() {
      @Override
      @NonNull
      public Unit call() throws Exception {
        final SupportSQLiteStatement _stmt = __preparedStmtOfDeleteOlderThan.acquire();
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
          __preparedStmtOfDeleteOlderThan.release(_stmt);
        }
      }
    }, $completion);
  }

  @Override
  public Object getByResourceId(final String resourceId,
      final Continuation<? super ResourceCacheEntity> $completion) {
    final String _sql = "SELECT * FROM resource_cache WHERE resource_id = ?";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 1);
    int _argIndex = 1;
    _statement.bindString(_argIndex, resourceId);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<ResourceCacheEntity>() {
      @Override
      @Nullable
      public ResourceCacheEntity call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfResourceId = CursorUtil.getColumnIndexOrThrow(_cursor, "resource_id");
          final int _cursorIndexOfLocalPath = CursorUtil.getColumnIndexOrThrow(_cursor, "local_path");
          final int _cursorIndexOfDownloadedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "downloaded_at");
          final int _cursorIndexOfLastAccessedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "last_accessed_at");
          final ResourceCacheEntity _result;
          if (_cursor.moveToFirst()) {
            final String _tmpResourceId;
            _tmpResourceId = _cursor.getString(_cursorIndexOfResourceId);
            final String _tmpLocalPath;
            _tmpLocalPath = _cursor.getString(_cursorIndexOfLocalPath);
            final long _tmpDownloadedAt;
            _tmpDownloadedAt = _cursor.getLong(_cursorIndexOfDownloadedAt);
            final long _tmpLastAccessedAt;
            _tmpLastAccessedAt = _cursor.getLong(_cursorIndexOfLastAccessedAt);
            _result = new ResourceCacheEntity(_tmpResourceId,_tmpLocalPath,_tmpDownloadedAt,_tmpLastAccessedAt);
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
  public Object getAll(final Continuation<? super List<ResourceCacheEntity>> $completion) {
    final String _sql = "SELECT * FROM resource_cache ORDER BY last_accessed_at DESC";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
    final CancellationSignal _cancellationSignal = DBUtil.createCancellationSignal();
    return CoroutinesRoom.execute(__db, false, _cancellationSignal, new Callable<List<ResourceCacheEntity>>() {
      @Override
      @NonNull
      public List<ResourceCacheEntity> call() throws Exception {
        final Cursor _cursor = DBUtil.query(__db, _statement, false, null);
        try {
          final int _cursorIndexOfResourceId = CursorUtil.getColumnIndexOrThrow(_cursor, "resource_id");
          final int _cursorIndexOfLocalPath = CursorUtil.getColumnIndexOrThrow(_cursor, "local_path");
          final int _cursorIndexOfDownloadedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "downloaded_at");
          final int _cursorIndexOfLastAccessedAt = CursorUtil.getColumnIndexOrThrow(_cursor, "last_accessed_at");
          final List<ResourceCacheEntity> _result = new ArrayList<ResourceCacheEntity>(_cursor.getCount());
          while (_cursor.moveToNext()) {
            final ResourceCacheEntity _item;
            final String _tmpResourceId;
            _tmpResourceId = _cursor.getString(_cursorIndexOfResourceId);
            final String _tmpLocalPath;
            _tmpLocalPath = _cursor.getString(_cursorIndexOfLocalPath);
            final long _tmpDownloadedAt;
            _tmpDownloadedAt = _cursor.getLong(_cursorIndexOfDownloadedAt);
            final long _tmpLastAccessedAt;
            _tmpLastAccessedAt = _cursor.getLong(_cursorIndexOfLastAccessedAt);
            _item = new ResourceCacheEntity(_tmpResourceId,_tmpLocalPath,_tmpDownloadedAt,_tmpLastAccessedAt);
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
  public Object getCacheCount(final Continuation<? super Integer> $completion) {
    final String _sql = "SELECT COUNT(*) FROM resource_cache";
    final RoomSQLiteQuery _statement = RoomSQLiteQuery.acquire(_sql, 0);
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
