# Decompose: Save State

### Введение

Это продолжение четырех предыдущих статей.

1. В первой мы разобрали, где в конечном итоге хранится `ViewModelStore` в случае с `Activity`.
2. Во второй — как это устроено во `Fragment`.
3. В третьей — где хранятся `ViewModel`-и, когда мы используем **Compose** (или даже просто `View`).
4. В четвёртой — как работают методы `onSaveInstanceState`/`onRestoreInstanceState`, Saved State API и где хранится `Bundle`.

В этой статье разберёмся, как нашумевшая библиотека **Decompose** справляется без `ViewModel` и методов `onSaveInstanceState`,
ведь она является кроссплатформенной (KMP) библиотекой.

Статья не о том, *как* использовать эти API, а о том, *как* они работают изнутри. Поэтому я буду полагаться на то,
что вы уже знакомы с ними или хотя бы имеете общее представление.

Как всегда, начнём с базиса. Давайте сначала дадим определение Decompose:

### Базис

**Decompose** — это мультиплатформенная библиотека для разделения бизнес-логики и UI, разработанная Аркадием Ивановым.
Она работает поверх `ComponentContext`, который управляет жизненным циклом, состоянием и навигацией между компонентами.

Поддерживает: Android, iOS, JS, JVM, macOS, watchOS, tvOS.

Зачем использовать:

* логика отделена от UI и легко тестируется
* работает с Compose, SwiftUI, React и др.
* навигация и состояние — кроссплатформенные
* компоненты переживают конфигурационные изменения (как `ViewModel`)
* можно расширять и кастомизировать `ComponentContext` под свои задачи

**Decompose** — это не фреймворк, а мощный инструмент, на котором можно построить свой API. Кратко говоря, это швейцарский нож.

В Android сложно представить приложение без стандартной `ViewModel`, и удивительно, что в **Decompose** её нет, но при этом
она умеет сохранять данные как при изменении конфигурации, так и при уничтожении процесса.

Давайте быстро разберёмся с сущностями, на которых основана Decompose:

Всё в **Decompose** крутится вокруг `ComponentContext` — компонента, связанного с определённым экраном или набором дочерних компонентов.
У каждого компонента есть свой `ComponentContext`, который реализует следующие интерфейсы:

* **LifecycleOwner** — предоставляется библиотекой **Essenty**, даёт каждому компоненту собственный жизненный цикл.
* **StateKeeperOwner** — позволяет сохранять любое состояние при конфигурационных изменениях и/или смерти процесса.
* **InstanceKeeperOwner** — даёт возможность сохранять любые объекты внутри компонента (аналог `ViewModel` в AndroidX).
* **BackHandlerOwner** — позволяет каждому компоненту обрабатывать нажатие кнопки «назад».

Основное внимание мы уделим именно `StateKeeperOwner` и `InstanceKeeperOwner`. Как видно, они на самом деле тянутся из библиотеки
**Essenty**, которая также была создана Аркадием Ивановым. Однако особую популярность эта библиотека получила именно благодаря **Decompose**.

Начнём углубляться в работу `StateKeeperOwner`. Я буду полагаться на то, что вы уже читали предыдущие статьи. Давайте начнём.

## StateKeeperOwner

Чтобы понять, как он работает, давайте реализуем простой экран `Counter`. Цель — увидеть,
как счётчик умеет переживать изменение конфигурации и даже смерть процесса.

Начнём с создания компонента для счетчика:

```kotlin
class DefaultCounterComponent(
    componentContext: ComponentContext
) : ComponentContext by componentContext {

    val model: StateFlow<Int> field = MutableStateFlow(stateKeeper.consume(KEY, Int.serializer()) ?: 0)

    init {
        stateKeeper.register(KEY, Int.serializer()) { model.value }
    }

    fun increase() {
        model.value++
    }

    fun decrease() {
        model.value--
    }

    companion object {
        private const val KEY = "counter_state"
    }
}
```

Довольно простая логика: у нас есть `model`, который хранит текущее значение счётчика, и два метода для его изменения.
При инициализации переменной мы получаем значение из `stateKeeper` через `consume`, если оно отсутствует — используем `0` по умолчанию.

А в init блоке мы регистрируем лямбду, которая будет вызвана при сохранении состояния. Пока просто запомните этот момент — позже разберёмся, как и когда она срабатывает.

Теперь экран счетчика, который работает с `DefaultCounterComponent`:

```kotlin
@Composable
fun CounterScreen(component: DefaultCounterComponent) {
    val count by component.model.collectAsState()

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(text = count.toString(), style = MaterialTheme.typography.headlineLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(40.dp)) {
            FloatingActionButton(onClick = { component.decrease() }) { Text("-", fontSize = 56.sp) }
            FloatingActionButton(onClick = { component.increase() }) { Text("+", fontSize = 56.sp) }
        }
    }
}
```

И, наконец, `Activity`, в которой инициализируется `ComponentContext` и вызывается экран `CounterScreen`:

```kotlin
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val counterComponent = DefaultCounterComponent(defaultComponentContext())
        setContent { CounterScreen(component = counterComponent) }
    }
}
```

Давай те визуально проверим:
1. Как будет ввести себя счетчик при изменений конфигураций( именно orientation)
2. Как будет ввести себя счетчик при уничтожений процесса пока приложение в фоне
![Screenshot](output.gif)

Как видим все работает ровно так как ожидалось, при этом мы тут не видим не методы onSaveInstanceState, и ни ViewModel, давайте
снова глянем на компонент счетчика:

```kotlin
class DefaultCounterComponent(
    componentContext: ComponentContext
) : ComponentContext by componentContext {

    val model: StateFlow<Int> field = MutableStateFlow(stateKeeper.consume(KEY, Int.serializer()) ?: 0)

    init {
        stateKeeper.register(KEY, Int.serializer()) { model.value }
    }
    ...

    companion object {
        private const val KEY = "counter_state"
    }
}
```

При пересозданий активности после изменений конфигураций или смерти процесса DefaultCounterComponent будет создаваться каждый
раз, и в том числе поле model тоже, в таком кейсе мы обращаемся к stateKeeper и вызывая у него метод consume получаем по ключу сохроненное значение
если там нечего нет, в качестве значения по умолчанию используем 0, а в init блоке мы видим регистрацию каллбэка с использованием 
метрда StateKeeper.register передавая ему коюч, стратегию сериализаций из kotlinx.serialization и лямюду которая возвращает значение model.

Глянем на исходники откуда береться поле stateKeeper что бы понять его работу, 
наш DefaultCounterComponent реализует интерфейс ComponentContext, а поле stateKeeper береться у StateKeeperOwner, полная цепочка насоедования
такая

```kotlin
/**
 * Represents a holder of [StateKeeper].
 */
interface StateKeeperOwner {

    val stateKeeper: StateKeeper
}


/**
 * A generic component context that extends [LifecycleOwner], [StateKeeperOwner],
 * [InstanceKeeperOwner] and [BackHandlerOwner] interfaces, and also able to create
 * new instances of itself via [ComponentContextFactory].
 */
interface GenericComponentContext<out T : Any> :
    LifecycleOwner,
    StateKeeperOwner,
    InstanceKeeperOwner,
    BackHandlerOwner,
    ComponentContextFactoryOwner<T>


interface ComponentContext : GenericComponentContext<ComponentContext>

```

То есть цепочка наследования такая:
StateKeeperOwner <- GenericComponentContext <- ComponentContext - мы реализуем ComponentContext но делегируем ее параметру в конструкторе:

```kotlin
class DefaultCounterComponent(
componentContext: ComponentContext
) : ComponentContext by componentContext {
    ....
}
```

А в MainActivity создаем ComponentContext используя готовую extension фукнцию defaultComponentContext, которая за нас 
уже создает ComponentContext со всеми нужными компонентами вроде StateKeeper
```kotlin
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        ...
        val counterComponent = DefaultCounterComponent(defaultComponentContext())
        ...
    }
}
```
## Продолжаем разбор: цепочка до настоящего хранилища

Итак, мы уже увидели, как в компоненте вызывается `stateKeeper.consume()` и `stateKeeper.register()`, и знаем, что сам компонент получает 
`stateKeeper` через свой `ComponentContext`. 
Но что именно происходит между вызовом в Activity/Fragment и конечным хранилищем? 
Пройдемся по цепочке, которую мы только что вывели из исходников.

### Как создаётся StateKeeper

В Activity (или Fragment) создаётся `DefaultComponentContext`, и ему передается результат вызова `defaultComponentContext()`. Заглянем внутрь:

```kotlin
fun <T> T.defaultComponentContext(
    discardSavedState: Boolean = false,
    isStateSavingAllowed: () -> Boolean = { true },
): DefaultComponentContext where
    T : SavedStateRegistryOwner, T : OnBackPressedDispatcherOwner, T : ViewModelStoreOwner, T : LifecycleOwner =
    defaultComponentContext(
        backHandler = BackHandler(onBackPressedDispatcher),
        discardSavedState = discardSavedState,
        isStateSavingAllowed = isStateSavingAllowed,
    )
```
Обратите внимание что функция является разширением для T, где T должен быть объект реализующий интерфейс SavedStateRegistryOwner,
OnBackPressedDispatcherOwner, ViewModelStoreOwner, LifecycleOwner, классы (ComponentActivity, FragmentActivity, AppCompatActivity)
идеально подходят,
Внутри по сути просто собираются все нужные зависимости и прокидываются чуть дальше в ещё одну функцию обёртку, где уже инициализируется всё, 
что нужно для хранения состояния:

```kotlin
private fun <T> T.defaultComponentContext(
    backHandler: BackHandler?,
    discardSavedState: Boolean,
    isStateSavingAllowed: () -> Boolean,
): DefaultComponentContext where
    T : SavedStateRegistryOwner, T : ViewModelStoreOwner, T : LifecycleOwner {
    val stateKeeper = stateKeeper(discardSavedState = discardSavedState, isSavingAllowed = isStateSavingAllowed)
    ...
    return DefaultComponentContext(
        lifecycle = lifecycle.asEssentyLifecycle(),
        stateKeeper = stateKeeper,
        instanceKeeper = instanceKeeper(discardRetainedInstances = marker == null),
        backHandler = backHandler,
    )
}
```

Вот тут и начинается самое интересное, создается объект StateKeeper вызовом фукнций stateKeeper, и пробрасывается дальше.

### Как создаётся сам stateKeeper

Теперь посмотрим, откуда взялся этот объект. Всё упирается в extension-функцию stateKeeper 
которая является расширением для SavedStateRegistryOwner:

```kotlin

private const val KEY_STATE = "STATE_KEEPER_STATE"

fun SavedStateRegistryOwner.stateKeeper(
    discardSavedState: Boolean = false,
    isSavingAllowed: () -> Boolean = { true },
): StateKeeper =
    stateKeeper(
        key = KEY_STATE,
        discardSavedState = discardSavedState,
        isSavingAllowed = isSavingAllowed,
    )
```

Здесь просто прокидывается ключ (по умолчанию `"STATE_KEEPER_STATE"`), и происходит вызов другугов метода stateKeeper:

```kotlin
fun SavedStateRegistryOwner.stateKeeper(
    key: String,
    discardSavedState: Boolean = false,
    isSavingAllowed: () -> Boolean = { true },
): StateKeeper =
    StateKeeper(
        savedStateRegistry = savedStateRegistry,
        key = key,
        discardSavedState = discardSavedState,
        isSavingAllowed = isSavingAllowed
    )
```

Тут мы уже явно вызываем конструктор `StateKeeper` (на самом деле это функция так же, не класс).
Сюда подаётся главный объект — `savedStateRegistry`. Да-да, тот самый, что из AndroidX, который лежит внутри Activity и Fragment и используется для всех системных onSaveInstanceState.

### Что реально происходит внутри StateKeeper

Вот теперь мы приблизились к сути, StateKeeper это фукнция которая создает реальный объект интерфейса StateKeeper:

```kotlin
fun StateKeeper(
    savedStateRegistry: SavedStateRegistry,
    key: String,
    discardSavedState: Boolean = false,
    isSavingAllowed: () -> Boolean = { true },
): StateKeeper {
    val dispatcher =
        StateKeeperDispatcher(
            savedState = savedStateRegistry
                .consumeRestoredStateForKey(key = key)
                ?.getSerializableContainer(key = KEY_STATE)
                ?.takeUnless { discardSavedState },
        )

    savedStateRegistry.registerSavedStateProvider(key = key) {
        Bundle().apply {
            if (isSavingAllowed()) {
                putSerializableContainer(key = KEY_STATE, value = dispatcher.save())
            }
        }
    }

    return dispatcher
}
```

Вот он — наш главный гейтвей между миром Android и системой сохранения состояния в Decompose. Давай по строчкам:

* Извлекается ранее сохранённое состояние из `SavedStateRegistry` по ключу (по сути — из стандартного хранилища состояния для instance state).
* Создаётся объект `StateKeeperDispatcher` (имплементация интерфейса StateKeeper), который умеет хранить сериализованные значения и потом возвращать их через consume.
* Регистрируется новый провайдер для сохранения состояния — функция, которая будет вызвана при необходимости сохранить состояние активности/фрагмента, и она сериализует текущее состояние через `dispatcher.save()`.

registerSavedStateProvider здесь вызывается для того что бы хранить сам StateKeeperDispatcher, то есть в конечном итоге
будет сохраняться только сам StateKeeperDispatcher(он же наследник интерфейса StateKeeper), в итоге
получается что значения которые мы будем положить в StateKeeper будут храниться внутри StateKeeperDispatcher, а сам StateKeeperDispatcher
будет храниться внутри Bundle, с помощью нового SavedStateRegistry, и SavedStateProvider

---

### К чему это всё ведёт

То есть, по факту, StateKeeper — это просто адаптер между внутренней системой хранения состояния в Decompose и системным `SavedStateRegistry` (а значит — тем самым `onSaveInstanceState` в Activity/Fragment, только более удобно и декларативно, и с поддержкой сериализации через kotlinx.serialization).
Кратко по цепочке:

1. В компоненте DefaultCounterComponent мы вызываем consume/register через интерфейс StateKeeper.
2. StateKeeper реализован как StateKeeperDispatcher.
3. StateKeeperDispatcher внутри себя хранит значения, сериализует их и регистрирует функцию для сохранения в системный Bundle через SavedStateRegistry.
Важно понять что значения которые мы регистрируем в StateKeeper не будут вызывать напрямую  savedStateRegistry.registerSavedStateProvider и регистрировать SavedStateProvider, 
Они будут храниться внутри StateKeeperDispatcher(StateKeeper), а сам StateKeeperDispatcher это единственный контейнерный объект который будет хранится
в SavedStateRegistry, и только для него будет вызыван SavedStateRegistry#registerSavedStateProvider
4. Все сериализуется/десериализуется через kotlinx.serialization (удобно, не надо возиться с Parcelable и прочей болью).

Осталось увидеть сам StateKeeper и его прямого наследника StateKeeperDispatcher:
```kotlin

/**
 * A key-value storage, typically used to persist data after process death or Android configuration changes.
 */
interface StateKeeper {

    /**
     * Removes and returns a previously saved value for the given [key].
     *
     * @param key a key to look up.
     * @param strategy a [DeserializationStrategy] for deserializing the value.
     * @return the value for the given [key] or `null` if no value is found.
     */
    fun <T : Any> consume(key: String, strategy: DeserializationStrategy<T>): T?

    /**
     * Registers the value [supplier] to be called when it's time to persist the data.
     *
     * @param key a key to be associated with the value.
     * @param strategy a [SerializationStrategy] for serializing the value.
     * @param supplier a supplier of the value.
     */
    fun <T : Any> register(key: String, strategy: SerializationStrategy<T>, supplier: () -> T?)

    /**
     * Unregisters a previously registered `supplier` for the given [key].
     */
    fun unregister(key: String)

    /**
     * Checks if a `supplier` is registered for the given [key].
     */
    fun isRegistered(key: String): Boolean
}
```

От него наследуется StateKeeperDispatcher:
```kotlin
/**
 * Represents a savable [StateKeeper].
 */
interface StateKeeperDispatcher : StateKeeper {

    /**
     * Calls all registered `suppliers` and saves the data into a [SerializableContainer].
     */
    fun save(): SerializableContainer
}

/**
 * Creates a default implementation of [StateKeeperDispatcher] with the provided [savedState].
 */
@JsName("stateKeeperDispatcher")
fun StateKeeperDispatcher(savedState: SerializableContainer? = null): StateKeeperDispatcher =
    DefaultStateKeeperDispatcher(savedState)
```

Тут так же видим метод StateKeeperDispatcher, который мы ранее уже видели, это был не класс, а фукнция StateKeeperDispatcher которая
создает DefaultStateKeeperDispatcher:
```kotlin

internal class DefaultStateKeeperDispatcher(
    savedState: SerializableContainer?,
) : StateKeeperDispatcher {

    private val savedState: MutableMap<String, SerializableContainer>? = savedState?.consume(strategy = SavedState.serializer())?.map
    private val suppliers = HashMap<String, Supplier<*>>()

    override fun save(): SerializableContainer {
        val map = savedState?.toMutableMap() ?: HashMap()

        suppliers.forEach { (key, supplier) ->
            supplier.toSerializableContainer()?.also { container ->
                map[key] = container
            }
        }

        return SerializableContainer(value = SavedState(map), strategy = SavedState.serializer())
    }

    private fun <T : Any> Supplier<T>.toSerializableContainer(): SerializableContainer? =
        supplier()?.let { value ->
            SerializableContainer(value = value, strategy = strategy)
        }

    override fun <T : Any> consume(key: String, strategy: DeserializationStrategy<T>): T? =
        savedState
            ?.remove(key)
            ?.consume(strategy = strategy)

    override fun <T : Any> register(key: String, strategy: SerializationStrategy<T>, supplier: () -> T?) {
        check(!isRegistered(key)) { "Another supplier is already registered with the key: $key" }
        suppliers[key] = Supplier(strategy = strategy, supplier = supplier)
    }

    override fun unregister(key: String) {
        check(isRegistered(key)) { "No supplier is registered with the key: $key" }
        suppliers -= key
    }

    override fun isRegistered(key: String): Boolean = key in suppliers

    private class Supplier<T : Any>(
        val strategy: SerializationStrategy<T>,
        val supplier: () -> T?,
    )

    @Serializable
    private class SavedState(
        val map: MutableMap<String, SerializableContainer>
    )
}
```