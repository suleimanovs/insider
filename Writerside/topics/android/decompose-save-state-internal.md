# Decompose: Save State

### Введение

Это продолжение четырех предыдущих статей.

1. В первой мы разобрали, где в конечном итоге хранится `ViewModelStore` в случае с `Activity`.
2. Во второй — как это устроено во `Fragment`.
3. В третьей — где хранятся `ViewModel`-и, когда мы используем **Compose** (или даже просто `View`).
4. В четвёртой — как работают методы `onSaveInstanceState`/`onRestoreInstanceState`, Saved State API и где хранится `Bundle`.

В этой статье разберёмся, как широко используемая в KMP библиотека **Decompose** справляется без `ViewModel` и методов
`onSaveInstanceState`,
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
**Essenty**, которая также была создана Аркадием Ивановым. Однако особую популярность эта библиотека получила именно благодаря **Decompose
**.

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

А в init блоке мы регистрируем лямбду, которая будет вызвана при сохранении состояния. Пока просто запомните этот момент — позже разберёмся,
как и когда она срабатывает.

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

Теперь давайте проверим поведение визуально:

1. Как будет вести себя счётчик при изменении конфигурации (именно повороте экрана).
2. Как будет вести себя счётчик при уничтожении процесса, когда приложение находится в фоне.

![Screenshot](stateKeeper.gif)

Как видим, всё работает ровно так, как ожидалось. При этом мы не видим здесь ни методов `onSaveInstanceState`, ни `ViewModel`. Давайте снова
взглянем на компонент счётчика:

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

При пересоздании активности — как из-за изменения конфигурации, так и после смерти процесса — `DefaultCounterComponent` будет создаваться
заново, и вместе с ним создаётся и поле `model`. В таком случае мы обращаемся к `stateKeeper` и, вызывая у него метод `consume`,
получаем по ключу сохранённое значение. Если сохранённого значения нет, используем значение по умолчанию — `0`.

В `init`-блоке мы регистрируем коллбэк через метод `stateKeeper.register`, передавая ему ключ, стратегию сериализации из
`kotlinx.serialization` и лямбду, возвращающую текущее значение `model`.

Посмотрим на исходники, чтобы понять, откуда берётся поле `stateKeeper`. Наш `DefaultCounterComponent` реализует интерфейс
`ComponentContext`, а поле `stateKeeper` приходит из `StateKeeperOwner`. Полная цепочка наследования следующая:

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

Таким образом, цепочка наследования выглядит так:
`StateKeeperOwner` ← `GenericComponentContext` ← `ComponentContext`.
Мы реализуем `ComponentContext`, делегируя его переданному в конструктор параметру `componentContext`.

```kotlin
class DefaultCounterComponent(
    componentContext: ComponentContext
) : ComponentContext by componentContext {
    ...
}
```

А в `MainActivity` создаём `ComponentContext`, используя готовую extension-функцию `defaultComponentContext`,
которая за нас уже создаёт `ComponentContext` со всеми нужными компонентами, вроде `StateKeeper`:

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

Итак, мы уже увидели, как в компоненте вызываются `stateKeeper.consume()` и `stateKeeper.register()`, и знаем, что сам компонент получает
`stateKeeper` через свой `ComponentContext`.
Но что именно происходит между вызовом в `Activity`/`Fragment` и конечным хранилищем?
Пройдёмся по цепочке, которую мы только что вывели из исходников.

### Как создаётся `StateKeeper`

В `Activity` (или `Fragment`) создаётся `DefaultComponentContext`, и ему передаётся результат вызова `defaultComponentContext()`. Заглянем
внутрь:

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

Обратите внимание, что функция является расширением для `T`, где `T` должен быть объектом, реализующим интерфейсы `SavedStateRegistryOwner`,
`OnBackPressedDispatcherOwner`, `ViewModelStoreOwner`, `LifecycleOwner`. Классы `ComponentActivity`, `FragmentActivity`, `AppCompatActivity`
идеально подходят под эти требования.

Внутри по сути просто собираются все нужные зависимости и прокидываются чуть дальше — в ещё одну функцию-обёртку, где уже инициализируется
всё,
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

Вот тут и начинается самое интересное — создаётся объект `StateKeeper` вызовом функции `stateKeeper` и пробрасывается дальше.

### Как создаётся сам `StateKeeper`

Теперь посмотрим, откуда взялся этот объект. Всё упирается в extension-функцию `stateKeeper`,
которая является расширением для `SavedStateRegistryOwner`:

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

Здесь просто прокидывается ключ (по умолчанию `"STATE_KEEPER_STATE"`), и происходит вызов другого метода `stateKeeper`:

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

Тут мы уже явно вызываем конструктор `StateKeeper` (на самом деле это функция, а не класс).
Сюда подаётся главный объект — `savedStateRegistry`. Да-да, тот самый из AndroidX,
который находится внутри `Activity` и `Fragment` и используется системой для всех вызовов `onSaveInstanceState`.

### Что реально происходит внутри `StateKeeper`

Вот теперь мы приблизились к сути. `StateKeeper` — это функция, которая создаёт реальный объект интерфейса `StateKeeper`:

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

Вот он — наш главный гейтвей между миром Android и системой сохранения состояния в Essenty/Decompose. Давайте по строчкам:

* Извлекается ранее сохранённое состояние из `SavedStateRegistry` по ключу — по сути, из стандартного `Bundle`, в который Android сохраняет
  данные при onPause/onStop
* Создаётся объект `StateKeeperDispatcher` — это конкретная реализация интерфейса `StateKeeper`, которая умеет хранить сериализованные
  значения, зарегистрированные вручную, и при необходимости возвращать их обратно через `consume`.
* Регистрируется новый `SavedStateProvider` — это лямбда, которую Android вызовет при необходимости сохранить состояние. Именно в ней
  `dispatcher.save()` собирает зарегистрированные значения и подготавливает их к сохранению.

Вызов `SavedStateRegistry.registerSavedStateProvider` здесь — точка подключения к системе восстановления Android.
Он позволяет сохранить состояние `StateKeeperDispatcher` в `Bundle`, чтобы при следующем запуске его можно было восстановить.
Весь этот механизм — адаптер между KMP-механикой сохранения и Android API.

И вот тут вступает в игру `SerializableContainer`.

Когда вызывается `dispatcher.save()`, все значения, зарегистрированные через `stateKeeper.register(...)`, сериализуются и оборачиваются в
`SerializableContainer`.

Это универсальная обёртка, которая хранит данные в виде `ByteArray`, а затем превращает их в строку с помощью `Base64`. Благодаря этому
результат можно безопасно сохранить в `Bundle` как обычную строку — без `Parcelable`, `putSerializable()` и без Java `Serializable`. При
восстановлении этот путь проходит в обратную сторону: строка → байты → объект через `kotlinx.serialization`.

Таким образом, при вызове `dispatcher.save()` мы получаем сериализуемый контейнер, который можно безопасно положить в `Bundle`. И вот здесь
важна не просто сериализация, а то, как именно она устроена. Это не `Parcelable`, и не `Serializable` — это `SerializableContainer`.

`SerializableContainer` — это отдельная сущность, которая оборачивает объект и умеет работать с `kotlinx.serialization` напрямую. Она сама
сериализуема, поскольку реализует `KSerializer`, и может быть сохранена в `Bundle` без дополнительных усилий. Ниже — её внутренняя
реализация:

```kotlin
@Serializable(with = SerializableContainer.Serializer::class)
class SerializableContainer private constructor(
    private var data: ByteArray?,
) {
    constructor() : this(data = null)

    private var holder: Holder<*>? = null

    fun <T : Any> consume(strategy: DeserializationStrategy<T>): T? {
        val consumedValue: Any? = holder?.value ?: data?.deserialize(strategy)
        holder = null
        data = null
        @Suppress("UNCHECKED_CAST") return consumedValue as T?
    }

    fun <T : Any> set(value: T?, strategy: SerializationStrategy<T>) {
        holder = Holder(value = value, strategy = strategy)
        data = null
    }

    private class Holder<T : Any>(
        val value: T?,
        val strategy: SerializationStrategy<T>,
    )

    internal object Serializer : KSerializer<SerializableContainer> {
        private const val NULL_MARKER = "."
        override val descriptor = PrimitiveSerialDescriptor("SerializableContainer", PrimitiveKind.STRING)

        override fun serialize(encoder: Encoder, value: SerializableContainer) {
            val bytes = value.holder?.serialize() ?: value.data
            encoder.encodeString(bytes?.toBase64() ?: NULL_MARKER)
        }

        override fun deserialize(decoder: Decoder): SerializableContainer =
            SerializableContainer(data = decoder.decodeString().takeUnless { it == NULL_MARKER }?.base64ToByteArray())
    }
}
```

Что здесь важно:

* В методе `set(...)` сохраняется объект и соответствующая стратегия сериализации, но не происходит немедленной сериализации.
* Только при вызове сериализатора (`Serializer`) объект превращается в `ByteArray`, а затем в строку.
* После восстановления — `decodeString()` → `ByteArray` → десериализация с использованием заранее известной стратегии.

Это даёт контроль над моментом сериализации и возможность отложенной обработки.

Теперь о том, как это всё оказывается внутри `Bundle`. Ниже — вспомогательные функции, которые используются внутри библиотеки
Essenty/Decompose для
сериализации и десериализации `SerializableContainer` и произвольных объектов, вызовы которых мы уже встречали в фукнций StateKeeper:

```kotlin
fun <T : Any> Bundle.putSerializable(key: String?, value: T?, strategy: SerializationStrategy<T>) {
    putParcelable(key, ValueHolder(value = value, bytes = lazy { value?.serialize(strategy) }))
}

fun <T : Any> Bundle.getSerializable(key: String?, strategy: DeserializationStrategy<T>): T? =
    getParcelableCompat<ValueHolder<T>>(key)?.let { holder ->
        holder.value ?: holder.bytes.value?.deserialize(strategy)
    }

@Suppress("DEPRECATION")
private inline fun <reified T : Parcelable> Bundle.getParcelableCompat(key: String?): T? =
    classLoader.let { savedClassLoader ->
        try {
            classLoader = T::class.java.classLoader
            getParcelable(key) as T?
        } finally {
            classLoader = savedClassLoader
        }
    }

fun Bundle.putSerializableContainer(key: String?, value: SerializableContainer?) {
    putSerializable(key = key, value = value, strategy = SerializableContainer.serializer())
}

fun Bundle.getSerializableContainer(key: String?): SerializableContainer? =
    getSerializable(key = key, strategy = SerializableContainer.serializer())
```

Отдельно стоит упомянуть сущность `ValueHolder`:

```kotlin
private class ValueHolder<out T : Any>(
    val value: T?,
    val bytes: Lazy<ByteArray?>,
) : Parcelable {
    override fun writeToParcel(dest: Parcel, flags: Int) {
        dest.writeByteArray(bytes.value)
    }

    override fun describeContents(): Int = 0

    companion object CREATOR : Parcelable.Creator<ValueHolder<Any>> {
        override fun createFromParcel(parcel: Parcel): ValueHolder<Any> =
            ValueHolder(value = null, bytes = lazyOf(parcel.createByteArray()))

        override fun newArray(size: Int): Array<ValueHolder<Any>?> =
            arrayOfNulls(size)
    }
}
```

`ValueHolder` здесь нужен для безопасной упаковки сериализованных байт в `Bundle` через `Parcelable`. Он не сериализует объект напрямую — он
сохраняет только `ByteArray`, который позже может быть развёрнут обратно в объект через `kotlinx.serialization`.
Истинная причина по которой нужен этот объект в том что Bundle может хранит Parcleable и Java Serializeble, но он не умеет
напрямую работать с `kotlinx.serialization`, по этому он служит в качестве обертки.

Таким образом, `SerializableContainer` + `ValueHolder` — это низкоуровневая инфраструктура сериализации, которая позволяет сохранить
произвольные значения Kotlin Multiplatform без зависимостей на Android-специфичные интерфейсы, сохраняя кроссплатформенность и контроль над
сериализацией.

### К чему это всё ведёт

То есть, по факту, `StateKeeper` — это просто адаптер между внутренней системой хранения состояния в Essenty/Decompose и системным
`SavedStateRegistry`
(а значит — тем самым `onSaveInstanceState` в `Activity`/`Fragment`, только более удобно и декларативно, и с поддержкой сериализации через
`kotlinx.serialization`).

Кратко по цепочке:

1. В компоненте `DefaultCounterComponent` мы вызываем `consume`/`register` через интерфейс `StateKeeper`.
2. `StateKeeper` реализован как `StateKeeperDispatcher`.
3. `StateKeeperDispatcher` внутри себя хранит значения, сериализует их и регистрирует функцию для сохранения в системный `Bundle` через
   `SavedStateRegistry`.
   Важно понять, что значения, которые мы регистрируем в `StateKeeper`, не вызывают напрямую `savedStateRegistry.registerSavedStateProvider`
   и не создают отдельные `SavedStateProvider`'ы.
   Всё сохраняется централизованно — в одном объекте `StateKeeperDispatcher`, и только он регистрируется в `SavedStateRegistry`.
4. Всё сериализуется и десериализуется через `kotlinx.serialization`, без `Parcelable`, `Bundle.putXXX()` и прочего boilerplate.

Посмотрим интерфейс `StateKeeper` и его прямого наследника `StateKeeperDispatcher`:

**com.arkivanov.essenty.statekeeper.StateKeeper.kt:**

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

Вот чуть более развернутые описания методов `StateKeeper`, по одному предложению на каждый:

1. **`consume`** — извлекает и удаляет ранее сохранённое значение по заданному ключу, используя стратегию десериализации.
2. **`register`** — регистрирует поставщика значения, которое будет сериализовано и сохранено при следующем сохранении состояния.
3. **`unregister`** — удаляет ранее зарегистрированного поставщика, чтобы его значение больше не сохранялось.
4. **`isRegistered`** — возвращает `true`, если по указанному ключу уже зарегистрирован поставщик значения.

**com.arkivanov.essenty.statekeeper.StateKeeperDispatcher.kt:**

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

Метод `save()` в `StateKeeperDispatcher` — это тот самый метод, который мы уже встречали ранее: `dispatcher.save()`.
Именно он вызывается в момент, когда Android собирается сохранить состояние активности или фрагмента, и через него сериализуются все
зарегистрированные значения.
Тут мы снова видим функцию `StateKeeperDispatcher`, которую уже встречали ранее. Напомню — это не класс, а фабричная функция,
которая создаёт экземпляр `DefaultStateKeeperDispatcher` — единственную реализацию интерфейса `StateKeeperDispatcher`:

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

Эта реализация управляет двумя основными структурами:

* `savedState` — карта уже восстановленных значений из `SavedStateRegistry`, если они были сохранены ранее;
* `suppliers` — все зарегистрированные поставщики значений, которые должны быть сериализованы при следующем сохранении состояния.

Когда вызывается метод `save()`, он собирает все текущие значения из `suppliers`, сериализует их и упаковывает в `SerializableContainer`,
который затем сохраняется системой. Восстановление происходит через метод `consume()`, где по ключу извлекается значение из `savedState` и
десериализуется с помощью переданной стратегии.

### Вывод

Мы прошли весь путь — от компонента, использующего `stateKeeper.consume()` и `register()`, до конечного объекта, сериализуемого в `Bundle`.
Разобрали, как `StateKeeper` цепляется к `SavedStateRegistry`, как значения хранятся внутри `StateKeeperDispatcher`, и как именно они
сохраняются и восстанавливаются через сериализацию.

`StateKeeper` — в android это обёртка над Android Saved State API, которая пришла на замену `onSaveInstanceState`, но реализована
декларативно и кроссплатформенно.
Она позволяет сохранять произвольные значения через `kotlinx.serialization`, без использования `Parcelable`, `Bundle.putX`, reflection и
других низкоуровневых деталей.

Давайте визуально глянем на цепочку вызовов что бы понять работу StateKeeper:

**`StateKeeper.register(...)`**:

```
DefaultCounterComponent  
  └── stateKeeper.register(...)  
        └── StateKeeper (интерфейс)  
              └── StateKeeperDispatcher (интерфейс)  
                    └── DefaultStateKeeperDispatcher.register(...)  
                          └── suppliers[key] = Supplier(...)

StateKeeper(...) // создание при инициализации  
  └── SavedStateRegistry.registerSavedStateProvider("state_keeper_key")  
        └── dispatcher.save()  
              └── сериализация значений через kotlinx.serialization  
                    └── оборачивание в SerializableContainer  
                          └── Bundle.putSerializable("state", ...)
```

**`StateKeeper.consume(...)`**:

```
defaultComponentContext()  
  └── stateKeeper(...)  
        └── StateKeeper(...)  
              └── StateKeeperDispatcher(savedState = ...)  
                    └── DefaultStateKeeperDispatcher.consume(key, strategy)  
                          └── savedState.remove(key)?.consume(strategy)  
                                └── SerializableContainer.consume(strategy)  
                                      └── kotlinx.serialization.decodeFromByteArray(...)
```

Теперь разберём другой механизм сохранения состояния в Decompose — точнее, в библиотеке **Essenty**, на которой всё построено.

## InstanceKeeper

**InstanceKeeper** — это один из "всадников" `ComponentContext`. Его задача — сохранять произвольные объекты, которые не должны уничтожаться
при конфигурационных изменениях (например, при повороте экрана). Это аналог `ViewModel` из Android Jetpack, но в контексте
кроссплатформенной разработки (KMP).

Переделаем наш компонент `DefaultCounterComponent`, чтобы вместо `StateKeeper` использовать `InstanceKeeper`:

```kotlin

class DefaultCounterComponent(
    componentContext: ComponentContext
) : ComponentContext by componentContext {

    val model: StateFlow<Int> field = instanceKeeper.getOrCreate(
        key = KEY,
        factory = {
            object : InstanceKeeper.Instance {
                val state = MutableStateFlow(0)
            }
        }
    ).state
    
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

<tip> Обратите внимание: блок `init` был удалён, а изменена только переменная `model`. Всё остальное осталось без изменений.</tip>

Теперь давайте проверим поведение визуально:
1. Как будет вести себя счётчик при изменении конфигурации (именно повороте экрана).
2. Как будет вести себя счётчик при уничтожении процесса, когда приложение находится в фоне.

![Screenshot](instanceKeeper.gif)

Что мы видим? Счётчик переживает поворот экрана, но обнуляется при смерти процесса. Это как раз поведение `ViewModel`, и именно этого мы
ожидаем от `InstanceKeeper`.

Теперь давайте посмотрим, как эта конструкция работает под капотом.

Для начала определим, кто вообще отвечает за хранение `InstanceKeeper`. В Essenty (и, соответственно, в Decompose) это интерфейс:

```kotlin
/**
 * Represents a holder of [InstanceKeeper].
 */
interface InstanceKeeperOwner {

    val instanceKeeper: InstanceKeeper
}
```

Он реализуется в `GenericComponentContext`, а значит, и в `ComponentContext`, который используется в каждом компоненте:

```kotlin
interface GenericComponentContext<out T : Any> :
    LifecycleOwner,
    StateKeeperOwner,
    InstanceKeeperOwner,
    BackHandlerOwner,
    ComponentContextFactoryOwner<T>

interface ComponentContext : GenericComponentContext<ComponentContext>
```

Таким образом, цепочка наследования выглядит так:
`InstanceKeeperOwner` ← `GenericComponentContext` ← `ComponentContext`.

Теперь разберёмся, **откуда приходит реализация**.

В `MainActivity` мы создаём компонент верхнего уровня через функцию `defaultComponentContext()`. 
Именно она формирует `ComponentContext`, внедряя внутрь все нужные зависимости: `Lifecycle`, `StateKeeper`, `InstanceKeeper`, `BackHandler`.

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        ...
        val counterComponent = DefaultCounterComponent(defaultComponentContext())
        ...
    }
}
```

Посмотрим ещё раз на исходники `defaultComponentContext()`:

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

На этом уровне происходит лишь проксирование вызова — все зависимости собираются и передаются дальше, в приватную функцию:

```kotlin
private fun <T> T.defaultComponentContext(
    backHandler: BackHandler?,
    discardSavedState: Boolean,
    isStateSavingAllowed: () -> Boolean,
): DefaultComponentContext where
        T : SavedStateRegistryOwner, T : ViewModelStoreOwner, T : LifecycleOwner {
    ...
    return DefaultComponentContext(
        lifecycle = lifecycle.asEssentyLifecycle(),
        stateKeeper = stateKeeper,
        instanceKeeper = instanceKeeper(discardRetainedInstances = marker == null),
        backHandler = backHandler,
    )
}
```

Ключевая строка здесь — `instanceKeeper = instanceKeeper(...)`.

Вот она и есть точка, где создаётся (или восстанавливается) `InstanceKeeper`, и теперь наша задача — посмотреть, что за функция `instanceKeeper(...)`,
как она устроена и как реализована логика хранения внутри.

Видим что для создания InstanceKeeper вызывается функция `instanceKeeper`:
```kotlin
/**
 * Creates a new instance of [InstanceKeeper] and attaches it to the AndroidX [ViewModelStore].
 *
 * @param discardRetainedInstances a flag indicating whether any previously retained instances should be
 * discarded and destroyed or not, default value is `false`.
 */
fun ViewModelStoreOwner.instanceKeeper(discardRetainedInstances: Boolean = false): InstanceKeeper =
    InstanceKeeper(viewModelStore = viewModelStore, discardRetainedInstances = discardRetainedInstances)
```

Видим что функция instanceKeeper является расширением для ViewModelStoreOwner, этот вызов внутри defaultComponentContext возможен
потому что дженнерик у фукнций defaultComponentContext явно требует что бы дженнерик был наследников интерфейса ViewModelStoreOwner,
видим что идет обращение к InstanceKeeper, хоть и выглядит как класс, на самом деле это фукнция:

```kotlin
/**
 * Creates a new instance of [InstanceKeeper] and attaches it to the provided AndroidX [ViewModelStore].
 *
 * @param discardRetainedInstances a flag indicating whether any previously retained instances should be
 * discarded and destroyed or not, default value is `false`.
 */
fun InstanceKeeper(
    viewModelStore: ViewModelStore,
    discardRetainedInstances: Boolean = false,
): InstanceKeeper =
    ViewModelProvider(
        viewModelStore,
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = InstanceKeeperViewModel() as T
        }
    )
        .get<InstanceKeeperViewModel>()
        .apply {
            if (discardRetainedInstances) {
                recreate()
            }
        }
        .instanceKeeperDispatcher
```

И тут все то очевидно, InstanceKeeper сущность для Android полагается на саму ViewModel которую использует внутри неявно, на уровне
самого апи даже нет намека на это, видим инициализацию и создание ViewModel-и, а именно InstanceKeeperViewModel,
далее у этой ViewModel идет обращение к instanceKeeperDispatcher, далее тело самого InstanceKeeperViewModel:

```kotlin

internal class InstanceKeeperViewModel : ViewModel() {
    var instanceKeeperDispatcher: InstanceKeeperDispatcher = InstanceKeeperDispatcher()
        private set

    override fun onCleared() {
        instanceKeeperDispatcher.destroy()
    }

    fun recreate() {
        instanceKeeperDispatcher.destroy()
        instanceKeeperDispatcher = InstanceKeeperDispatcher()
    }
}
```

//TODO для chatgpt: тут нужно просто пару слов с обьяснением внутренности этой ViewModel и полей

```kotlin

/**
 * Represents a destroyable [InstanceKeeper].
 */
interface InstanceKeeperDispatcher : InstanceKeeper {

    /**
     * Destroys all existing instances. Instances are not cleared, so that they can be
     * accessed later. Any new instances will be immediately destroyed.
     */
    fun destroy()
}

/**
 * Creates a default implementation of [InstanceKeeperDispatcher].
 */
@JsName("instanceKeeperDispatcher")
fun InstanceKeeperDispatcher(): InstanceKeeperDispatcher = DefaultInstanceKeeperDispatcher()
```

//TODO для chatgpt: тут тоже

```kotlin


/**
 * A generic keyed store of [Instance] objects. Instances are destroyed at the end of the
 * [InstanceKeeper]'s scope, which is typically tied to the scope of a back stack entry.
 * E.g. instances are retained over Android configuration changes, and destroyed when the
 * corresponding back stack entry is popped.
 */
interface InstanceKeeper {

    /**
     * Returns an instance with the given [key], or `null` if no instance with the given key exists.
     */
    fun get(key: Any): Instance?

    /**
     * Stores the given [instance] with the given [key]. Throws [IllegalStateException] if another
     * instance is already registered with the given [key].
     */
    fun put(key: Any, instance: Instance)

    /**
     * Removes an instance with the given [key]. This does not destroy the instance.
     */
    fun remove(key: Any): Instance?

    /**
     * Represents a destroyable instance.
     */
    interface Instance {

        /**
         * Called at the end of the [InstanceKeeper]'s scope.
         */
        fun onDestroy() {}
    }

    /**
     * Are simple [Instance] wrapper for cases when destroying is not required.
     */
    class SimpleInstance<out T>(val instance: T) : Instance
}
```

//TODO для chatgpt: тут тоже, немного про интерфейс Instance тоже

```kotlin


internal class DefaultInstanceKeeperDispatcher : InstanceKeeperDispatcher {

    private val map = HashMap<Any, Instance>()
    private var isDestroyed = false

    override fun get(key: Any): Instance? =
        map[key]

    override fun put(key: Any, instance: Instance) {
        check(key !in map) { "Another instance is already associated with the key: $key" }

        map[key] = instance

        if (isDestroyed) {
            instance.onDestroy()
        }
    }

    override fun remove(key: Any): Instance? =
        map.remove(key)

    override fun destroy() {
        if (!isDestroyed) {
            isDestroyed = true
            map.values.toList().forEach(Instance::onDestroy)
        }
    }
}

```

//TODO для chatgpt: тут тоже

Мы в нашем компоненте DefaulConterComponent использовали не фукнцию , а функцию getOrCreate:

```kotlin
/**
 * Returns a previously stored [InstanceKeeper.Instance] of type [T] with the given key,
 * or creates and stores a new one if it doesn't exist.
 */
inline fun <T : InstanceKeeper.Instance> InstanceKeeper.getOrCreate(key: Any, factory: () -> T): T {
    @Suppress("UNCHECKED_CAST") // Assuming the type per key is always the same
    var instance: T? = get(key) as T?
    if (instance == null) {
        instance = factory()
        put(key, instance)
    }

    return instance
}

```