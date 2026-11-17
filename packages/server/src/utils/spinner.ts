/**
 * 给所有需要等待的操作添加对应的spinner
 */
import ora from 'ora';

/**
 * 给需要等待的操作添加一个 spinner
 */
export async function withSpinnerError<T>(
    callback: () => Promise<T>,
    startMessage: string,
    errorMessage: string,
    timeout: number = 5000,
): Promise<T | Error> {
    const spinner = ora(startMessage).start();
    let timer: NodeJS.Timeout | null = null;
    const timerPromise = new Promise<Error>((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorMessage || 'Timeout')), timeout);
    });
    try {
        const result = await Promise.race<T | Error>([callback(), timerPromise]);
        return result as T;
    } catch (error) {
        return error as Error;
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
        spinner.stop();
    }
}
