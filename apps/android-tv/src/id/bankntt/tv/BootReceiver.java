package id.bankntt.tv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Opens the queue display when the TV starts (and after an app update). */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            context.startActivity(open);
        } catch (RuntimeException ignored) {
            // Android 10+ without "display over other apps": the TV stays on its home screen.
        }
    }
}
