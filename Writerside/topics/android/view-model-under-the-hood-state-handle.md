Это продолжение трех предыдущих статей.

### Введение

1. В первой мы разобрали, где в конечном итоге хранится `ViewModelStore` в случае с `Activity`,
2. Во второй — как это устроено во `Fragment`,
3. В третьей где хранятся `ViewModel`-и, когда мы используем **Compose** (или даже просто `View`).

В этой статье рассмотрим Где хранится SavedStateHandle, SavedStateHandle vs onSaveInstanceState vs ViewModel(ViewModelStore)
Особенно когда мы объявляем `ViewModel` прямо внутри `Composable` функций. Но, как всегда, начнём с базиса.

### Базис

В статье не будет описания как работать с этими Api, а будет о том как они работают изнутри, по этому я буду пологаться на то
что вы уже работали с ними.
Как всегда начнем с базиса, давайте сначала дадим определения для SavedStateHandle, onSaveInstanceState, ViewModel:

**ViewModel** - компонент архитектурного паттерна MVVM, который был предоставлен Google как примитив
позволяющий пережить изменение конфигураций. Изменение конфигураций в свою очередь - это состояние, заставляющая
activity/fragment пересоздаваться, это именно то состояние которое может пережить ViewModel. Увы на этом обьязанности ViewModel по
хранению данных заканчивается

Если proccess приложения умирает или прырывается proccess , то в таком случае ViewModel не справится,
по этому тут в дело входит старый добрый метод onSaveInstanceState/onRestoreInstanceState

**onSaveInstanceState/onRestoreInstanceState** — это методы жизненного цикла Activity, Fragment и View(да View тоже может сохронять
состояние)
которые позволяют сохранять и восстанавливать временное состояние пользовательского интерфейса при изменениях конфигурации (например, при
повороте экрана)
или при полном уничтожении активности из-за нехватки ресурсов.
В onSaveInstanceState данные сохраняются в Bundle, который автоматически передаётся в метод onRestoreInstanceState при восстановлении
активности.

Это базовый механизм для хранения состояния примитивных(и их массивы) типов данных, Parcelable/ Serializeble и еще пару нативных андроид
типов,
но он требует явного указания того, что именно нужно сохранить.

**SavedState API** — это современная альтернатива методу onSaveInstanceState, которая более гибко управляет состоянием, особенно в
связке с ViewModel.

**SavedStateHandle** — это объект, предоставленный в конструкторе ViewModel, который позволяет безопасно сохранять и восстанавливать данные,
даже если процесс был уничтожен. В отличие от статичного использования onSaveInstanceState, SavedStateHandle предоставляет так же
возможность
подписаться на Flow, LiveData данные которые он хранит и восстанавливает
Он автоматически интегрирован с ViewModel и поддерживает сохранение состояния при изменениях конфигурации, а также при полном уничтожении
приложения(процесса).
Дополнительное преимущество — это возможность подписываться на изменения значений в SavedStateHandle, получая реактивное поведение прямо в
ViewModel.

### onSaveInstanceState/ onRestoreInstanceState

Давайте так же освижим память о методах onSaveInstanceState/ onRestoreInstanceState:

```kotlin
class RestoreActivity : AppCompatActivity() {

    private var counter = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Восстановление значения при пересоздании
        counter = savedInstanceState?.getInt("counter_key") ?: 0
    }

    override fun onRestoreInstanceState(savedInstanceState: Bundle) {
        super.onRestoreInstanceState(savedInstanceState)
        // Восстановление значения при пересоздании
        counter = savedInstanceState.getInt("counter_key")
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        // Сохраняем значение
        outState.putInt("counter_key", counter)
        Log.d("MainActivity", "onSaveInstanceState: Counter saved = $counter")
    }
}
```

**onSaveInstanceState** — вызывается для получения состояния Activity перед её уничтожением, чтобы это состояние могло быть
восстановлено в методах `onCreate` или `onRestoreInstanceState`. `Bundle`, заполненный в этом методе, будет передан в оба метода.

Этот метод вызывается перед тем, как активность может быть уничтожена, чтобы в будущем, при повторном создании, она могла восстановить своё
состояние. Не следует путать этот метод с методами жизненного цикла, такими как `onPause`, который всегда вызывается, когда пользователь больше не
взаимодействует с активностью, или `onStop`, который вызывается, когда активность становится невидимой. Пример, когда `onPause` и `onStop`
вызываются, но `onSaveInstanceState` — нет: пользователь возвращается из Activity B в Activity A — в этом случае состояние B не требуется
восстанавливать, поэтому `onSaveInstanceState` для B не вызывается. Другой пример: если Activity B запускается поверх Activity A, но A
остаётся в памяти, то `onSaveInstanceState` для A также не вызывается, так как его состояние остаётся неизменным.

Реализация по умолчанию этого метода автоматически сохраняет большую часть состояния пользовательского интерфейса, вызывая метод
`onSaveInstanceState()` у каждого представления (`View`) в иерархии, у которого есть ID, и сохраняя ID элемента, который был в фокусе.
Восстановление этих данных будет происходить в стандартной реализации метода `onRestoreInstanceState()`. Если метод переопределяется для
сохранения дополнительной информации, которая не захвачена отдельными представлениями, рекомендуется вызвать реализацию по умолчанию через
`super.onSaveInstanceState(outState)`. В противном случае разработчику придётся вручную сохранять состояние всех представлений.

Если метод вызывается, то это произойдёт **после `onStop`** для приложений, нацеленных на платформы, начиная с Android P. Для более ранних
версий Android этот метод будет вызван **до `onStop`**, и нет никаких гарантий, будет ли он вызван до или после `onPause`.


**onRestoreInstanceState** — этот метод вызывается **после** `onStart`, когда активность повторно инициализируется из ранее сохранённого
состояния, переданного в `savedInstanceState`.
Большинство реализаций используют для восстановления состояния метод `onCreate`, но иногда бывает удобнее делать это здесь, после того как
завершена вся инициализация, или чтобы подклассы могли решить, использовать ли вашу реализацию по умолчанию.
Стандартная реализация этого метода восстанавливает состояние представлений (View), которое было ранее заморожено методом
`onSaveInstanceState`.
Этот метод вызывается **между `onStart` и `onPostCreate`**. Он срабатывает **только при повторном создании активности**; метод **не
вызывается**, если `onStart` был вызван по любой другой причине (например, при переходе из фона на передний план).

На этом примере временно забываем о них, чуть позже мы их снова встретим в более низкоуровневых цепочках вызовов.

### Saved State Api

Тот же Пример что и выше, только переписанный с использованием Saved State Api, делает ровно тоже самое:
```kotlin
class RestoreActivity : AppCompatActivity() {

    private var counter = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        savedStateRegistry.registerSavedStateProvider(
            key = "counter_key",
            provider = object : SavedStateRegistry.SavedStateProvider {
                override fun saveState(): SavedState {
                    return SavedState(bundleOf("counter" to counter))
                }
            }
        )

        // Восстановление значения при пересоздании
        counter = savedStateRegistry.consumeRestoredStateForKey("counter_key")?.getInt("counter", 0) ?: 0
    }
}
```

Мы вызываем у объекта savedStateRegistry метод registerSavedStateProvider куда передаем key и анонимный объект SavedStateRegistry.SavedStateProvider который
возвращает bundle обернутый в объект SavedState, давайте сейчас же определим что из себя представляет этот тип SavedState, если зайти в исходники, а
именно в expect логику, то тип описан следующим образом:
androidx.savedstate.SavedState.kt
```kotlin
/**
* An opaque (empty) common type that holds saveable values to be saved and restored by native
* platforms that have a concept of System-initiated Process Death.
*
* That means, the OS will give the chance for the process to keep the state of the application
* (normally using a serialization mechanism), and allow the app to restore its state later. That is
* commonly referred to as "state restoration".
*
* required to act as a source input for a [SavedStateReader] or [SavedStateWriter].
*
* This class represents a container for persistable state data. It is designed to be
* platform-agnostic, allowing seamless state saving and restoration across different environments.
  */
  public expect class SavedState
```
в контексте android нас интересует именно actual реализация, по этому далее специфичная для android actual:
androidx.savedstate.SavedState.android.kt
```kotlin
public actual typealias SavedState = android.os.Bundle
```
Как видим в android нет на самом деле какого-то типа как SavedState, в actual реализаций это просто typealias который ссылается
на тот же старый добрый родной класс Bundle, по этому всегда представляйте что там где используется SavedState - на самом деле используется
класс Bundle, и ничто нам не мешает не использовать двоную обертку, а напрямую вернуть сам bundle:
```
savedStateRegistry.registerSavedStateProvider(
    key = "counter_key",
    provider = object : SavedStateRegistry.SavedStateProvider {
        override fun saveState(): SavedState {
           return bundleOf("counter" to counter)
        }
    }
)
```
Раз с этим разобрались, дальше давайте зайдем в исходники метода registerSavedStateProvider, этот метод вызывается у переменной
savedStateRegistry которая имеет тип SavedStateRegistry, давайте быстро узнаем определение этого класса:

**`SavedStateRegistry`** - управляет сохранением и восстановлением сохранённого состояния, чтобы данные не терялись при пересоздании компонентов.
Реализация привязана к SavedStateRegistryImpl, которая отвечает за фактическое хранение и восстановление данных.
Интерфейс для подключения компонентов, которые потребляют и вносят данные в сохранённое состояние.
Объект имеет такой же жизненный цикл, как и его владелец (Activity или Fragment):
когда Activity или Fragment пересоздаются (например, при повороте экрана или изменении конфигурации),
создаётся новый экземпляр этого объекта.

Но откуда береться `savedStateRegistry` переменная внутри activity мы рассмотрим позже, пока достаточно знать 
что он есть у activity, далее исходники метода registerSavedStateProvider пренадлежащий классу `SavedStateRegistry`(expect):
**androidx.savedstate.SavedStateRegistry.kt**
```
public expect class SavedStateRegistry internal constructor(
    impl: SavedStateRegistryImpl,
) {

    /** This interface marks a component that contributes to saved state. */
    public fun interface SavedStateProvider {
        
        public fun saveState(): SavedState
    }

    ...
    public val isRestored: Boolean
    ...
    @MainThread public fun consumeRestoredStateForKey(key: String): SavedState?
    ...
    @MainThread public fun registerSavedStateProvider(key: String, provider: SavedStateProvider)
    ...
    public fun getSavedStateProvider(key: String): SavedStateProvider?
    ...
    @MainThread public fun unregisterSavedStateProvider(key: String)
}
```

в expect версий нет реализаций, только сигнатуры методов, так же мы увидели исходники интерфейса SavedStateProvider который является 
каллбэком для получения bundle который нужно сохранить, что бы увидеть реализацию метода registerSavedStateProvider, надо поискать
**actual реализацию, далее actual реализация SavedStateRegistry:**
```kotlin
public actual class SavedStateRegistry internal actual constructor(
    private val impl: SavedStateRegistryImpl,
) {

    @get:MainThread
    public actual val isRestored: Boolean
        get() = impl.isRestored

    @MainThread
    public actual fun consumeRestoredStateForKey(key: String): SavedState? =
        impl.consumeRestoredStateForKey(key)

    @MainThread
    public actual fun registerSavedStateProvider(key: String, provider: SavedStateProvider) {
        impl.registerSavedStateProvider(key, provider)
    }

    public actual fun getSavedStateProvider(key: String): SavedStateProvider? =
        impl.getSavedStateProvider(key)

    @MainThread
    public actual fun unregisterSavedStateProvider(key: String) {
        impl.unregisterSavedStateProvider(key)
    }

    public actual fun interface SavedStateProvider {
        public actual fun saveState(): SavedState
    }
    ...
}
```

actual реализация делегирует свои вызовы готовой имплементацией SavedStateRegistryImpl:



Давайте начнем разбираться, начнем рассматривать поэтапно:
```kotlin
savedStateRegistry.registerSavedStateProvider(key = "counter_key") { 
    SavedState(bundleOf("counter" to counter)) 
}
```

внутри activity нам доступна поле savedStateRegistry, это поле доступна так потому что Activity реализует interface SavedStateRegistryOwner
если зайти в исходники то можно это увидеть
что ComponentActivity реализует интерфейс SavedStateRegistryOwner, на самом деле ComponentActivity реализует много интерфейсов, в исходниках
ниже опущены родители.:
```
open class ComponentActivity() : ..., SavedStateRegistryOwner, ... {
     
    final override val savedStateRegistry: SavedStateRegistry
        get() = savedStateRegistryController.savedStateRegistry
        
}
```
SavedStateRegistryOwner - это просто interface который хранит в себе SavedStateRegistry, его реализует Activity, Fragment и NavBackStackEntry,






`SavedStateRegistry` — это механизм для сохранения состояния компонентов Android (в основном `Activity` и `Fragment`) при изменениях конфигурации (поворот экрана, изменение языка и т.п.) или уничтожении приложения.
Этот механизм позволяет сохранять данные в объекте `Bundle`, который автоматически восстанавливается при пересоздании компонента.

`SavedStateRegistry` доступен в любом компоненте, реализующем интерфейс `SavedStateRegistryOwner`. Этим интерфейсом обладают:

* `ComponentActivity` — это базовый класс для всех современных `Activity`.
* `Fragment` — любой `Fragment` также реализует этот интерфейс.

`SavedStateRegistryOwner` предоставляет доступ к объекту `SavedStateRegistry`, который автоматически создается в момент создания компонента в `onCreate`. Это позволяет сохранять и восстанавливать состояние компонентов без необходимости ручного управления процессом.

---

### Метод `registerSavedStateProvider`

```kotlin
savedStateRegistry.registerSavedStateProvider(key = "counter_key") { 
    SavedState(bundleOf("counter" to counter)) 
}
```

Метод `registerSavedStateProvider` используется для регистрации провайдера состояния, который будет вызван перед уничтожением активности или фрагмента для сохранения данных. Провайдер состояния реализует интерфейс `SavedStateProvider` и возвращает объект типа `SavedState`.

* `key` — строковый идентификатор, с которым связывается состояние.
* `provider` — объект, реализующий интерфейс `SavedStateProvider`, который возвращает объект типа `SavedState`.

---

### Интерфейс `SavedStateProvider`

```kotlin
public fun interface SavedStateProvider {
    fun saveState(): SavedState
}
```

`SavedStateProvider` — это функциональный интерфейс, который требует реализации метода `saveState()`. Этот метод вызывается при необходимости сохранить состояние компонента. В примере выше он возвращает объект `SavedState`, содержащий данные в виде `Bundle`.

---

### Метод `consumeRestoredStateForKey`

```kotlin
counter = savedStateRegistry.consumeRestoredStateForKey("counter_key")?.getInt("counter", 0) ?: 0
```

Метод `consumeRestoredStateForKey` используется для получения сохранённого состояния по указанному ключу. Если состояние было успешно восстановлено, метод возвращает объект `SavedState`. Если данные не были сохранены или ключ неверен, метод вернёт `null`. Важно помнить, что после первого вызова данные по этому ключу больше недоступны — они удаляются из памяти.

Этот метод можно вызывать **только после** `super.onCreate()`. В противном случае будет выброшено исключение `IllegalArgumentException`.

---

### Метод `unregisterSavedStateProvider`

Метод позволяет отвязать ранее зарегистрированного провайдера по ключу. После этого вызова состояние по данному ключу не будет восстановлено:

```kotlin
savedStateRegistry.unregisterSavedStateProvider("counter_key")
```

---

### Метод `getSavedStateProvider`

Для проверки, зарегистрирован ли провайдер по ключу, можно воспользоваться методом:

```kotlin
val provider = savedStateRegistry.getSavedStateProvider("counter_key")
```

Метод возвращает объект типа `SavedStateProvider`, если он зарегистрирован, иначе — `null`.

---

### Пример использования

```kotlin
class RestoreActivity : AppCompatActivity() {

    private var counter = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        savedStateRegistry.registerSavedStateProvider(key = "counter_key") { 
            Log.d("RestoreActivity", "Сохранение состояния: $counter")
            SavedState(bundleOf("counter" to counter))
        }

        counter = savedStateRegistry.consumeRestoredStateForKey("counter_key")
            ?.getInt("counter", 0) ?: 0

        Log.d("RestoreActivity", "Восстановленное значение: $counter")
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        counter++
        Log.d("RestoreActivity", "onSaveInstanceState: $counter")
    }
}
```

---

### Лог выполнения

```
Восстановленное значение: 0
onSaveInstanceState: 1
Сохранение состояния: 1
Восстановленное значение: 1
```

---

### KMP (Kotlin Multiplatform)

Почти все современные API для работы с состоянием в Android (включая `SavedStateRegistry`) переписаны под KMP (Kotlin Multiplatform). Это позволяет:

1. Использовать единый механизм сохранения состояния между Android и iOS.
2. Работать с одним и тем же API в Kotlin Multiplatform Shared Module (KMM).

---

Хочешь, чтобы я добавил сравнение с обычным `onSaveInstanceState` и объяснил, в чем основные отличия? Или продолжим с разбором внутренних механизмов `SavedStateRegistry`?
