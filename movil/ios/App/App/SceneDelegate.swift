import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = ContenedorViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// La web de Postfirma no está pensada para ir debajo de la barra de estado ni de la barra de inicio
/// (no usa viewport-fit=cover; su cabecera del móvil es «sticky» arriba). Por eso el controlador de
/// Capacitor va dentro de este, ajustado a la zona segura, y lo que queda fuera se pinta con el fondo
/// del programa: se ve igual que en Safari y no hay que tocar la web. Va en este fichero para no tener
/// que añadir otro al proyecto de Xcode.
final class ContenedorViewController: UIViewController {
    private let capacitor = CAPBridgeViewController()

    override func viewDidLoad() {
        super.viewDidLoad()
        // #f7f8fa, el fondo de Postfirma (theme-color de la web).
        view.backgroundColor = UIColor(red: 247 / 255, green: 248 / 255, blue: 250 / 255, alpha: 1)
        addChild(capacitor)
        guard let web = capacitor.view else { return }
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        let zona = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: zona.topAnchor),
            web.bottomAnchor.constraint(equalTo: zona.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: zona.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: zona.trailingAnchor),
        ])
        capacitor.didMove(toParent: self)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }
}
