export default class Utils {
    public static decodedEventsToArray(log: any) {
        const values: any = {};
        for (const event of log.events) {
            values[event.name] = event.value;
        }

        return values;
    }
}
